# Load .env FIRST — before importing `database` (which builds the engine from
# DATABASE_URL at import time). Previously the only load_dotenv lived in providers.py
# and ran AFTER database was imported, so .env's DATABASE_URL was silently ignored for
# the engine and a stray shell export could flip the DB unnoticed. override=False so a
# real environment variable (prod / orchestrator) still wins over the committed .env.
from dotenv import load_dotenv
load_dotenv(override=False)

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, Request
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from datetime import datetime

from database import get_db
from models import Project

from providers import EXTRACTION_ENSEMBLE, ask_direct_answer
import asyncio
from agreement import compute_agreement
from uuid import uuid4
from signal_classify import classify_signal
from synthesis_service import (
    generate_and_store_synthesis,
    synthesize_content,
    apply_measured_confidence,
    save_or_update_synthesis,
    build_synthesis_message,
    build_kg_for_synthesis,
    ConflictGateError,
    SYNTHESIS_MODEL,
)
from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    generate_csrf_token, get_current_user, set_auth_cookies, clear_auth_cookies,
    _verify_token, _extract_token_from_request, require_permissions,
    SECRET_KEY, ALGORITHM,
)
import llm_gateway as gateway  # §5.1/§10.2 LLM Gateway — stats/observability surface
from models import User
from pydantic import BaseModel, EmailStr



app = FastAPI()

# §10.2: central LLM gateway HTTP surface (POST /llm/chat) so Satellite + UML route
# through the same cache/breaker/budget/stats. Kept in its own module to avoid
# growing this god-file further (§6.1).
from llm_gateway_api import router as llm_gateway_router
app.include_router(llm_gateway_router)

from fastapi.middleware.cors import CORSMiddleware

# ─── §2.3: Alembic is the single source of truth for the schema ───────────────
# `Base.metadata.create_all` was removed: it only creates *missing* tables and
# silently ignores column/constraint drift, so fresh and migrated DBs diverged
# (the old chain was missing 6 tables + 16 columns it had been masking). On
# startup we bring the DB to the migration head instead.
#
# Adoption: a pre-existing create_all-built DB has the tables but no
# alembic_version row — stamp it at head rather than re-running DDL (which would
# fail "table already exists"). Fresh/empty DBs get a normal upgrade.
#
# Multi-worker prod: set RUN_MIGRATIONS_ON_STARTUP=0 and run `alembic upgrade head`
# once in the deploy step so workers don't race on DDL.
import os


def _ensure_schema_at_head() -> None:
    from alembic.config import Config
    from alembic import command
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy import inspect
    from database import engine

    backend_dir = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(backend_dir, "alembic.ini"))

    with engine.connect() as conn:
        current = MigrationContext.configure(conn).get_current_revision()
    legacy_untracked = current is None and inspect(engine).has_table("users")

    if legacy_untracked:
        command.stamp(cfg, "head")    # adopt existing create_all DB
    else:
        command.upgrade(cfg, "head")  # fresh DB → build; tracked DB → no-op/apply


if os.getenv("RUN_MIGRATIONS_ON_STARTUP", "1") == "1":
    _ensure_schema_at_head()

# ---------- Health ----------
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    # §2.6: actually exercise the DB so the check fails (503) when it is unreachable,
    # instead of reporting healthy on a broken pod.
    from sqlalchemy import text
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        logging.error(f"Health check DB failure: {e}")
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "db": "connected"}


@app.get("/llm/stats")
def llm_stats(_admin: dict = Depends(require_permissions("admin"))):
    # §10.2/§10.5: surface the LLM Gateway's process-wide accounting (calls, cache hits,
    # tokens per provider, errors) + active config. Admin-only — it reveals usage/cost.
    return {"config": gateway.config_summary(), "stats": gateway.get_stats()}

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

from rate_limit import RateLimiter

@app.post("/api/auth/register")
def register(user: UserCreate, db: Session = Depends(get_db), _rl: None = Depends(RateLimiter(5, 60, "register"))):
    existing = db.query(User).filter(User.email == user.email).first()

    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user.email,
        password=hash_password(user.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "User created"}


@app.post("/api/auth/login")
def login(user: UserLogin, request: Request, db: Session = Depends(get_db), _rl: None = Depends(RateLimiter(10, 60, "login"))):
    db_user = db.query(User).filter(User.email == user.email).first()

    # UX: when the email has no account, tell the client to register instead of a
    # dead-end "Invalid credentials". NOTE: this trades a little account-enumeration
    # resistance (an attacker can learn whether an email is registered) for usability
    # — an explicit product choice for this app. Wrong password stays generic.
    if not db_user:
        raise HTTPException(status_code=404, detail="account_not_found")
    if not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token_data = {"email": db_user.email}
    access_token = create_access_token(token_data)
    refresh_token, jti = create_refresh_token(token_data)
    csrf_token = generate_csrf_token()

    # §1.7 Auth Hardening: Store session in DB
    from models import RefreshToken
    from datetime import datetime, timedelta
    from auth import REFRESH_TOKEN_EXPIRE_DAYS
    device_info = request.headers.get("User-Agent", "Unknown")[:255]
    db_session = RefreshToken(
        id=jti,
        user_id=db_user.id,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        device_info=device_info
    )
    db.add(db_session)
    db.commit()

    from fastapi.responses import JSONResponse
    response = JSONResponse(content={
        # §5.4: access_token in body is DEPRECATED — kept temporarily for migration.
        # Clients should rely on httpOnly cookies instead.  Will be removed.
        "access_token": access_token,
        "token_type": "bearer",
    })
    set_auth_cookies(response, access_token, refresh_token, csrf_token)
    return response


@app.post("/api/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    """Clear all auth cookies and revoke session in DB."""
    from models import RefreshToken
    token = _extract_token_from_request(request, token_type="refresh")
    if token:
        try:
            payload = _verify_token(token, expected_type="refresh")
            jti = payload.get("jti")
            if jti:
                db_token = db.query(RefreshToken).filter(RefreshToken.id == jti).first()
                if db_token:
                    db_token.revoked = True
                    db.commit()
        except:
            pass # Ignore invalid tokens during logout

    from fastapi.responses import JSONResponse
    response = JSONResponse(content={"message": "Logged out"})
    clear_auth_cookies(response)
    return response


@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the authenticated user's profile.  Frontend uses this instead of decoding JWTs."""
    db_user = db.query(User).filter(User.email == current_user["email"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(db_user.id),
        "email": db_user.email,
        "role": current_user.get("role", "user"),
        # §1.7 Richer profile response
        "nickname": db_user.email.split("@")[0],
        "permissions": ["admin", "project.read", "project.write", "project.delete", "users.manage"] if current_user.get("role") == "admin" else [],
        "avatar": "",
        "createdAt": "2026-06-28T00:00:00Z" # Mocked for now, until DB adds createdAt to Users
    }


@app.post("/api/auth/refresh")
def refresh(request: Request, db: Session = Depends(get_db), _rl: None = Depends(RateLimiter(20, 60, "refresh"))):
    """
    Issue a new access token using the refresh token cookie, and rotate the refresh token.
    """
    token = _extract_token_from_request(request, token_type="refresh")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = _verify_token(token, expected_type="refresh")
    email = payload["sub"]
    role = payload.get("role", "user")
    jti = payload.get("jti")

    from models import RefreshToken
    from datetime import datetime, timedelta
    if not jti:
        raise HTTPException(status_code=401, detail="Invalid refresh token (missing JTI)")
        
    db_token = db.query(RefreshToken).filter(RefreshToken.id == jti).first()
    if not db_token:
        raise HTTPException(status_code=401, detail="Session not found")
        
    if db_token.revoked:
        # Anomaly detection: Token reuse detected. Revoke all sessions for this user.
        db.query(RefreshToken).filter(RefreshToken.user_id == db_token.user_id).update({"revoked": True})
        db.commit()
        raise HTTPException(status_code=401, detail="Token reuse detected. All sessions revoked.")
        
    # Rotate token
    db_token.revoked = True
    
    new_access = create_access_token({"email": email, "role": role})
    new_refresh_token, new_jti = create_refresh_token({"email": email, "role": role})
    
    from auth import REFRESH_TOKEN_EXPIRE_DAYS
    new_db_token = RefreshToken(
        id=new_jti,
        user_id=db_token.user_id,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        device_info=request.headers.get("User-Agent", "Unknown")[:255]
    )
    db.add(new_db_token)
    db.commit()

    csrf_token = generate_csrf_token()

    from fastapi.responses import JSONResponse
    response = JSONResponse(content={"refreshed": True})

    # Re-set access + refresh + csrf cookies
    from auth import set_auth_cookies
    set_auth_cookies(response, new_access, new_refresh_token, csrf_token)
    
    return response


# NOTE: The anonymous `POST /api/auth/client-login` endpoint was removed (§5.1).
# It minted a valid JWT for any project given only its id — passwordless access by
# enumeration. The legitimate "share a project with a client/stakeholder" use case
# should return as an explicit, owner-initiated invite/share flow (future work).
# Internal automation now uses a locally-minted service token (SERVICE_ACCOUNT_EMAIL).



from typing import Optional, List, Dict

# ---------- Pydantic Schemas ----------

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    purpose: str = Field(..., min_length=10)
    success_criteria: str = Field(..., min_length=10)
    constraints: str = Field(..., min_length=5)
    owner: Optional[str] = None
    visibility: str = "private"


class ProjectOut(BaseModel):
    id: str
    name: str
    purpose: str
    success_criteria: str
    constraints: str
    owner: Optional[str]
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = dict(from_attributes=True)



# ---------- Endpoints ----------

from models import ProjectMember, JoinRequest

# ─── Access Control Helper ────────────────────────────────────────────────────
def log_project_activity(db: Session, project_id: str, actor_email: str, action: str, details: str = None):
    from models import ProjectActivityLog
    log = ProjectActivityLog(
        project_id=project_id,
        actor_email=actor_email,
        action=action,
        details=details
    )
    db.add(log)

def _get_project_member(db: Session, project_id: str, user_email: str):
    """Return ProjectMember object or None."""
    from models import ProjectMember
    return db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_email == user_email
    ).first()

# Reserved identity for internal server-to-server automation (e.g. the Satellite
# card scheduler). Tokens for this principal are signed with the shared JWT_SECRET,
# so trust is bounded by that secret — not by the open client-login endpoint.
SERVICE_ACCOUNT_EMAIL = "service@claritystack.internal"


def get_project_or_403(
    db: Session,
    project_id: str,
    user_email: str,
    allow_public_read: bool = False,
    allow_public_write: bool = False,
    required_roles: list = None
) -> "Project":
    """
    Fetch a project and enforce access control with RBAC.
    Roles: "owner", "pm", "member", "viewer"
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Internal automation principal: read-only access to any project (only GET
    # routes use this identity). Replaces the scheduler's old reliance on the
    # anonymous client-login token-minting hole (§5.1).
    if user_email == SERVICE_ACCOUNT_EMAIL:
        return project

    is_owner = project.owner == user_email
    member_obj = _get_project_member(db, project_id, user_email)
    user_role = "owner" if is_owner else (member_obj.role if member_obj else None)

    is_public = project.visibility == "public"

    # Enforce specific roles if requested
    if required_roles and user_role not in required_roles:
        # If public project and they don't have a role yet, they might get auto-enrolled below
        if not (is_public and allow_public_write and "member" in required_roles and user_role is None):
            raise HTTPException(status_code=403, detail="Insufficient permissions for this action.")

    if is_public and (allow_public_read or allow_public_write):
        if allow_public_write and not user_role:
            from models import ProjectMember
            new_member = ProjectMember(project_id=project_id, user_email=user_email, role="member")
            db.add(new_member)
            try:
                db.commit()
                log_project_activity(db, project_id, user_email, "user_joined", "Auto-enrolled on first write to public project")
                db.commit()
            except Exception:
                db.rollback()  # already enrolled via race condition
        return project

    if not user_role:
        # Hide the fact the project exists to prevent enumeration
        raise HTTPException(status_code=404, detail="Project not found")

    return project


def get_chat_or_403(db: Session, chat_id: str, user_email: str, allow_public: bool = False, required_roles: list = None) -> "Chat":
    """Fetch a chat and enforce that the caller has access to its parent project."""
    from models import Chat
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    # This will raise 404 if user has no access to the project
    get_project_or_403(
        db, chat.project_id, user_email,
        allow_public_read=allow_public,
        allow_public_write=allow_public,
        required_roles=required_roles
    )
    return chat

# ─────────────────────────────────────────────────────────────────────────────

@app.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_email = current_user["email"]

    project = Project(
        name = payload.name.strip(),
        purpose = payload.purpose.strip(),
        success_criteria = payload.success_criteria.strip(),
        constraints = payload.constraints.strip(),
        owner = user_email,
        visibility = payload.visibility
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    # Automatically assign as PM
    pm = ProjectMember(project_id=project.id, user_email=user_email, role="pm")
    db.add(pm)
    db.commit()

    return project


@app.get("/projects/public", response_model=List[ProjectOut])
def list_public_projects(
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Return all public projects — no authentication required (Discovery Hub)."""
    query = db.query(Project).filter(Project.visibility == "public")
    if search:
        query = query.filter(
            Project.name.ilike(f"%{search}%") |
            Project.purpose.ilike(f"%{search}%")
        )
    return query.order_by(Project.created_at.desc()).all()


@app.get("/projects", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_email = current_user["email"]
    
    # Projects I can see: Public OR I am owner OR I am member
    projects = (
        db.query(Project)
        .outerjoin(ProjectMember, Project.id == ProjectMember.project_id)
        .filter(
            (Project.visibility == "public") |
            (Project.owner == user_email) |
            (ProjectMember.user_email == user_email)
        )
        .order_by(Project.created_at.desc())
        .distinct()
        .all()
    )
    return projects

@app.get("/projects/search", response_model=List[ProjectOut])
def search_projects(
    project_id: Optional[str] = None, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return []
        return [project]
        
    return []

@app.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    project = get_project_or_403(db, project_id, current_user["email"], allow_public_read=True)
    return project

class JoinRequestCreate(BaseModel):
    pass

@app.post("/projects/{project_id}/join")
def request_join(project_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404)

    user_email = current_user["email"]
    member = db.query(ProjectMember).filter(ProjectMember.project_id == project_id, ProjectMember.user_email == user_email).first()
    if member:
        raise HTTPException(status_code=400, detail="Already a member")

    req = db.query(JoinRequest).filter(JoinRequest.project_id == project_id, JoinRequest.user_email == user_email).first()
    if req:
        raise HTTPException(status_code=400, detail="Request already sent")

    new_req = JoinRequest(project_id=project_id, user_email=user_email)
    db.add(new_req)
    db.commit()

    print(f"MOCK EMAIL: From {user_email} To {project.owner} - Request to join project {project.name}")

    return {"status": "Request sent"}

@app.get("/projects/{project_id}/join-requests")
def get_join_requests(project_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    get_project_or_403(db, project_id, current_user["email"], required_roles=["owner", "pm"])

    requests = db.query(JoinRequest).filter(JoinRequest.project_id == project_id).all()
    return [{"id": r.id, "user_email": r.user_email, "status": r.status} for r in requests]

@app.patch("/join-requests/{request_id}")
def update_join_request(request_id: str, status: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    req = db.query(JoinRequest).filter(JoinRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404)

    # Validate PM/Owner access
    get_project_or_403(db, req.project_id, current_user["email"], required_roles=["owner", "pm"])

    # §16.6: validate the status enum (it's a raw query string) and make approval
    # idempotent. Previously two PMs approving, a double-click, a re-PATCH, or approving
    # an already-auto-enrolled public user each added a fresh ProjectMember → duplicate
    # member rows. Guard on existing membership + only act on a still-pending request.
    if status not in ("accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status (expected 'accepted' or 'rejected')")

    if req.status != "pending":
        return {"status": f"Request already {req.status}"}

    if status == "accepted" and not _get_project_member(db, req.project_id, req.user_email):
        new_member = ProjectMember(project_id=req.project_id, user_email=req.user_email, role="member")
        db.add(new_member)
        log_project_activity(db, req.project_id, current_user["email"], "request_approved", f"Approved join request for {req.user_email}")

    req.status = status
    db.commit()
    return {"status": f"Request {status}"}

class InvitePayload(BaseModel):
    user_email: str

@app.post("/projects/{project_id}/invite")
def invite_user(project_id: str, payload: InvitePayload, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    get_project_or_403(db, project_id, current_user["email"], required_roles=["owner", "pm"])

    # check if already exists
    existing = _get_project_member(db, project_id, payload.user_email)
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")

    new_member = ProjectMember(project_id=project_id, user_email=payload.user_email, role="member")
    db.add(new_member)
    log_project_activity(db, project_id, current_user["email"], "user_joined", f"Invited {payload.user_email} as member")
    db.commit()
    return {"status": "User invited"}


class RoleUpdatePayload(BaseModel):
    role: str

@app.get("/projects/{project_id}/members")
def list_members(project_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = get_project_or_403(db, project_id, current_user["email"], allow_public_read=True)
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    result = [{"id": m.id, "project_id": m.project_id, "user_email": m.user_email, "role": m.role} for m in members]
    # Prepend the owner with role="owner" so frontend knows
    result.insert(0, {"id": "owner", "project_id": project_id, "user_email": project.owner, "role": "owner"})
    return result

@app.patch("/projects/{project_id}/members/{user_email}/role")

def update_member_role(project_id: str, user_email: str, payload: RoleUpdatePayload, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = get_project_or_403(db, project_id, current_user["email"], required_roles=["owner", "pm"])

    if project.owner == user_email:
        raise HTTPException(status_code=400, detail="Cannot change owner role")

    if payload.role not in ["pm", "member", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    member = _get_project_member(db, project_id, user_email)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    old_role = member.role
    member.role = payload.role
    log_project_activity(db, project_id, current_user["email"], "role_changed", f"Changed role of {user_email} from {old_role} to {payload.role}")
    db.commit()
    return {"status": "Role updated"}


@app.delete("/projects/{project_id}/members/{user_email}")
def remove_member(project_id: str, user_email: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    project = get_project_or_403(db, project_id, current_user["email"], required_roles=["owner", "pm"])

    if project.owner == user_email:
        raise HTTPException(status_code=400, detail="Cannot remove owner")

    member = _get_project_member(db, project_id, user_email)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    log_project_activity(db, project_id, current_user["email"], "user_removed", f"Removed {user_email} from project")
    db.commit()
    return {"status": "Member removed"}

from models import ProjectActivityLog

@app.get("/projects/{project_id}/activity")
def get_activity_logs(project_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    get_project_or_403(db, project_id, current_user["email"], required_roles=["owner", "pm"])

    logs = db.query(ProjectActivityLog).filter(ProjectActivityLog.project_id == project_id).order_by(ProjectActivityLog.created_at.desc()).limit(50).all()
    return [
        {
            "id": log.id,
            "actor_email": log.actor_email,
            "action": log.action,
            "details": log.details,
            "created_at": log.created_at
        } for log in logs
    ]


from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from fastapi import Path
from models import Project, Chat


class ChatCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    source_type: Optional[str] = Field(
        None,
        description="Where chat came from e.g. chatgpt/slack/manual"
    )

    # 🆕 CHAT CONTEXT FIELDS
    purpose: Optional[str] = "Chat purpose not yet defined."
    phase: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None


class ChatOut(BaseModel):
    id: str
    project_id: str
    title: Optional[str]
    source_type: Optional[str]
    external_chat_id: Optional[str]
    pinned: bool
    archived: bool

    # 🆕 CHAT CONTEXT
    purpose: str
    phase: Optional[str]
    description: Optional[str]
    owner: Optional[str]

    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


from fastapi import HTTPException


@app.post("/projects/{project_id}/chats", response_model=ChatOut)
def create_chat(
    project_id: str = Path(...),
    payload: ChatCreate = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Allow owners/members always; for public projects any authenticated user can create a chat
    # (they will be auto-enrolled as a member on first write)
    get_project_or_403(db, project_id, current_user["email"], allow_public_write=True, required_roles=["owner", "pm", "member"])

    chat = Chat(
        project_id=project_id,
        title=(payload.title.strip() if payload.title else None),
        source_type=payload.source_type,

        # 🆕 CONTEXT FIELDS
        purpose=payload.purpose or "Chat purpose not yet defined.",
        phase=payload.phase,
        description=payload.description,
        owner=payload.owner,
    )

    db.add(chat)
    db.commit()
    db.refresh(chat)

    return chat



from fastapi import Query

@app.get("/projects/{project_id}/chats", response_model=List[ChatOut])
def list_chats(
    project_id: str,
    archived: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # Enforce access: members/owners always allowed; public projects allow read
    get_project_or_403(db, project_id, current_user["email"], allow_public_read=True)

    chats = (
        db.query(Chat)
        .filter(Chat.project_id == project_id)
        .filter(Chat.archived == archived)
        .order_by(Chat.pinned.desc(), Chat.created_at.desc())
        .all()
    )

    return chats


from typing import List
from models import Message, Chat

from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


class MessageCreate(BaseModel):
    role: Optional[str] = Field(None, description="user/assistant/system/tool/etc")
    sender: Optional[str] = Field(None, max_length=255)
    text: str = Field(...)

    type: Optional[str] = None
    include_in_summary: bool = True
    topic: Optional[str] = None
    has_attachments: bool = False
    attachments_json: Optional[str] = None
    
    

    created_at: datetime   # original timestamp

    
    @field_validator("text")
    @classmethod
    def no_blank_messages(cls, v):
        if not v or not v.strip():
            raise ValueError("Message text cannot be empty")
        return v.strip()

    @field_validator("sender")
    @classmethod
    def validate_sender(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Sender name cannot be blank")
        return v.strip() if v else v


class MessageOut(BaseModel):
    id: str
    chat_id: str
    role: Optional[str]
    sender: Optional[str]
    type: Optional[str]

    text: str

    include_in_summary: bool
    has_attachments: bool
    attachments_json: Optional[str]
    topic: Optional[str]

    source_message_id: Optional[str]
    accepted: bool

    created_at: datetime
    ingested_at: datetime
    reply_group_id: Optional[str] = None

    signal_level: Optional[str] = None   # 👈 ADD THIS

    model_config = dict(from_attributes=True)


import json
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from models import QuarantinedMessage

@app.post("/chats/{chat_id}/messages", response_model=MessageOut)
def create_message(
    chat_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    # allow_public=True so members of public projects can post messages
    chat = get_chat_or_403(db, chat_id, current_user["email"], allow_public=True, required_roles=["owner", "pm", "member"])

    try:
        message = Message(
            chat_id=chat_id,
            role=payload.role,
            sender=payload.sender,
            text=payload.text,
            type=payload.type,
            include_in_summary=payload.include_in_summary,
            topic=payload.topic,
            has_attachments=payload.has_attachments,
            attachments_json=payload.attachments_json,
            created_at=payload.created_at
        )

        db.add(message)
        db.commit()
        db.refresh(message)
        return message

    except IntegrityError as e:
        # Bad/rejected message content (constraint/FK violation) — quarantine for review.
        # This is a client-data problem (400), distinct from an operational DB outage below.
        db.rollback()
        logging.warning(f"Message quarantined for chat {chat_id}: {type(e).__name__}: {e}")
        try:
            qm = QuarantinedMessage(
                chat_id=chat_id,
                raw_payload=json.dumps(payload.model_dump(), default=str),
                error_reason=f"{type(e).__name__}: {e}"
            )
            db.add(qm)
            db.commit()
        except SQLAlchemyError:
            # Don't let a quarantine-write failure mask the original rejection.
            db.rollback()
            logging.exception(f"Failed to persist quarantine record for chat {chat_id}")
        raise HTTPException(status_code=400, detail="Message rejected & quarantined for review")

    except SQLAlchemyError as e:
        # Operational DB failure (locked / unreachable) — NOT the message's fault, so do
        # not quarantine. Surface 503 so the client can retry; log full detail server-side.
        db.rollback()
        logging.exception(f"DB error storing message for chat {chat_id}")
        raise HTTPException(status_code=503, detail="Message storage temporarily unavailable")



from fastapi import Query

@app.get("/chats/{chat_id}/messages", response_model=List[MessageOut])
def list_messages(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    # §3.5: bound the payload. Defaults to the latest 500 messages (covers virtually
    # all chats); pass limit/offset to page through longer histories. Uses the
    # existing idx_messages_chatid_createdat index.
    chat = get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)

    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())   # latest first
        .offset(offset)
        .limit(limit)
        .all()
    )

    return messages

class SummaryToggle(BaseModel):
    include: bool

@app.patch("/messages/{message_id}/include", response_model=MessageOut)
def toggle_message_in_summary(
    message_id: str,
    payload: SummaryToggle,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    # Verify caller has access to the chat's parent project
    get_chat_or_403(db, message.chat_id, current_user["email"])

    message.include_in_summary = payload.include
    db.commit()
    db.refresh(message)

    return message


class MessageTypeUpdate(BaseModel):
    type: str

@app.patch("/messages/{message_id}/type", response_model=MessageOut)
def update_message_type(
    message_id: str,
    payload: MessageTypeUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    get_chat_or_403(db, message.chat_id, current_user["email"])

    message.type = payload.type
    db.commit()
    db.refresh(message)

    return message

from fastapi import HTTPException
import requests
from auth import create_access_token

def _call_satellite_cleanup(scope: str, target_id: str):
    try:
        # Mint internal token
        token = create_access_token({"email": "backend-service", "role": "internal"})
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {"scope": scope, "id": target_id}
        # Call satellite (URL configurable for non-localhost deployment, §6.4)
        import os
        satellite_url = os.getenv("SATELLITE_API_URL", "http://127.0.0.1:8003")
        resp = requests.post(f"{satellite_url}/api/satellite/internal/cleanup", json=payload, headers=headers, timeout=5)
        
        if resp.status_code == 200:
            logging.info(f"Satellite cleanup success for {scope} {target_id}: {resp.json().get('deleted')}")
            return True
        else:
            logging.warning(f"Satellite cleanup failed for {scope} {target_id}: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        logging.error(f"Satellite cleanup exception for {scope} {target_id}: {e}")
        return False

def _delete_chat_internal(chat_id: str, db: Session):
    """Internal helper — deletes a chat and its children without access control checks."""
    from models import Message, Synthesis, KnowledgeNode, KnowledgeEdge
    db.query(KnowledgeEdge).filter(KnowledgeEdge.chat_id == chat_id).delete(synchronize_session=False)
    db.query(KnowledgeNode).filter(KnowledgeNode.chat_id == chat_id).delete(synchronize_session=False)
    db.query(Message).filter(Message.chat_id == chat_id).delete(synchronize_session=False)
    db.query(Synthesis).filter(Synthesis.chat_id == chat_id).delete(synchronize_session=False)
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat:
        db.delete(chat)
        db.commit()
    _call_satellite_cleanup("chat", chat_id)


@app.delete("/chats/{chat_id}")
def delete_chat(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    # Only project PMs or Owners can delete chats
    get_project_or_403(db, chat.project_id, current_user["email"], required_roles=["owner", "pm"])

    _delete_chat_internal(chat_id, db)

    return {"status": "deleted", "chat_id": chat_id}

@app.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_email = current_user["email"]
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Only the owner or a PM can delete a project
    get_project_or_403(db, project_id, user_email, required_roles=["owner"])

    # 1. Manual Cleanup for related chats
    from models import Chat
    chats = db.query(Chat).filter(Chat.project_id == project_id).all()
    for chat in chats:
        _delete_chat_internal(chat.id, db)

    # 2. Delete project itself
    db.delete(project)
    db.commit()

    # 3. External cleanup
    scrubbed = _call_satellite_cleanup("project", project_id)

    return {"status": "deleted", "project_id": project_id, "satellite_scrubbed": scrubbed}

import time
import logging
from fastapi import Request

# §10.5: structured JSON logs + per-request correlation id (replaces the old plain
# basicConfig). Every log line in a request — including ones from the LLM gateway and
# from asyncio.to_thread workers — is stamped with the same request_id.
from logging_setup import configure_logging, set_request_id, request_id_var, new_request_id
configure_logging()

REQUEST_ID_HEADER = "X-Request-ID"


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Chain the id across services: reuse an inbound X-Request-ID if present, else mint
    # one. Reset the ContextVar in finally so ids never leak between requests.
    rid = request.headers.get(REQUEST_ID_HEADER) or new_request_id()
    token = set_request_id(rid)
    start_time = time.time()
    try:
        try:
            response = await call_next(request)
        except Exception:
            logging.exception("request_error", extra={
                "method": request.method, "path": request.url.path,
            })
            raise
        process_time = (time.time() - start_time) * 1000
        logging.info("request", extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round(process_time, 2),
        })
        response.headers[REQUEST_ID_HEADER] = rid
        return response
    finally:
        request_id_var.reset(token)


from pydantic import BaseModel, Field

# class ChatRename(BaseModel):
#     title: str = Field(..., min_length=1, max_length=255)


# @app.patch("/chats/{chat_id}", response_model=ChatOut)
# def rename_chat(
#     chat_id: str,
#     payload: ChatRename,
#     db: Session = Depends(get_db)
# ):
#     chat = db.query(Chat).filter(Chat.id == chat_id).first()

#     if not chat:
#         raise HTTPException(status_code=404, detail="Chat not found")

#     new_title = payload.title.strip()
#     if not new_title:
#         raise HTTPException(status_code=400, detail="Title cannot be empty")

#     chat.title = new_title
#     db.commit()
#     db.refresh(chat)

#     return chat

from pydantic import BaseModel

class PinUpdate(BaseModel):
    pinned: bool

@app.patch("/chats/{chat_id}/pin")
def update_pin_state(
    chat_id: str,
    payload: PinUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    chat = get_chat_or_403(db, chat_id, current_user["email"])
    chat.pinned = payload.pinned
    db.commit()
    db.refresh(chat)
    return {"status": "ok", "pinned": chat.pinned}

class ArchiveUpdate(BaseModel):
    archived: bool

@app.patch("/chats/{chat_id}/archive")
def archive_chat(
    chat_id: str,
    payload: ArchiveUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    chat = get_chat_or_403(db, chat_id, current_user["email"])
    chat.archived = payload.archived
    db.commit()
    db.refresh(chat)
    return {"status": "ok", "archived": chat.archived}

@app.get("/projects/{project_id}/chats/archived", response_model=List[ChatOut])
def list_archived_chats(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_project_or_403(db, project_id, current_user["email"])
    return (
        db.query(Chat)
        .filter(Chat.project_id == project_id, Chat.archived == True)
        .order_by(Chat.created_at.desc())
        .all()
    )

def safe(fn, prompt):
    try:
        return fn(prompt)
    except Exception as e:
        return f"⚠️ Error calling model: {e}"

from uuid import uuid4
from fastapi import HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pydantic import BaseModel
from uuid import uuid4
import json
from fastapi import Depends
from sqlalchemy.orm import Session



class AskPayload(BaseModel):
    sender: str
    text: str
    # §16.5 Ask-Anyway override: relax the conservative CONFLICT-semantics gate so a
    # valid answer isn't held back over phrasing. Default False keeps the gate on.
    ask_anyway: bool = False

def tag_with_provider(provider: str, block: str) -> str:
    return block.replace("- SOURCE::", f"- {provider.upper()}::")


@app.post("/chats/{chat_id}/ask")
async def ask_multi_model(
    chat_id: str,
    payload: AskPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    _rl: None = Depends(RateLimiter(30, 60, "ask"))
):
    get_chat_or_403(db, chat_id, current_user["email"])

    # §10.2: bill this request's model spend to the user. set on the request context
    # so the extraction/synthesis gateway calls — even those run via asyncio.to_thread
    # (which copies the contextvars Context) — inherit the tenant without signature changes.
    gateway.set_request_tenant(current_user["email"])

    # 1. Classify signal
    signal = classify_signal(payload.text)
    include = signal in ("high", "medium")

    user = Message(
        chat_id=chat_id,
        role="user",
        sender=payload.sender,
        text=payload.text,
        include_in_summary=include,
        has_attachments=False,
        accepted=False,
        signal_level=signal,
        type=None
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    # 2. Noise filter — §16.8: now overridable. A false-negative from the classifier used
    #    to silently eat a legitimate question with no recourse. `ask_anyway` forces the
    #    message through the full ensemble; the client surfaces it as an "Ask Anyway"
    #    retry (same affordance as the §16.5 conflict gate).
    if signal == "noise" and not payload.ask_anyway:
        default_reply = Message(
            chat_id=chat_id,
            role="assistant",
            sender="clarity-stack",
            text=(
                "This message looks like it contains very little actionable project "
                "context — so it wasn't added to your working summary.\n\n"
                "If this was important, use **Ask Anyway** to send it to the AI regardless 🙂"
            ),
            include_in_summary=False,
            accepted=False,
            signal_level=None
        )
        db.add(default_reply)
        db.commit()
        return {
            "status": "noise_filtered",
            "can_retry_ask_anyway": True,
            "detail": "This message looked low-signal, so it wasn't sent to the AI. Ask Anyway to force it through.",
        }

    # 3. Multi-model tagged extraction
    group = str(uuid4())

    # --- 🆕 CONTEXT INJECTION START ---
    from context_builder import build_chat_context
    history_block = build_chat_context(db, chat_id, limit=10)
    
    # Prepend history to the current user prompt
    prompt = f"{history_block}\n\n=== CURRENT USER REQUEST ===\n{payload.text}"
    # --- CONTEXT INJECTION END ---

    # §10.3: honest, single-source-of-truth ensemble. Labels are the REAL model ids
    # (e.g. "groq:llama-3.1-8b-instant"), not the old fictional "gemini"/"huggingface".
    providers = EXTRACTION_ENSEMBLE

    # §2.5: fan the (blocking) provider calls out concurrently instead of a serial
    # for-loop (~3× latency cut). `to_thread` keeps the event loop free; importantly,
    # NO database access happens inside these threads.
    async def _extract_one(name, fn):
        try:
            raw = await asyncio.to_thread(fn, prompt)   # returns SOURCE:: tagged text
            if not raw or not raw.strip():
                return None
            return (name, raw)
        except Exception as e:
            print(f"[LLM] Provider '{name}' failed: {e}")
            return None

    results = await asyncio.gather(*[_extract_one(n, f) for n, f in providers])

    extracted_blocks = []
    provider_blocks = {}   # §10.3: {honest_label: raw_IR} for measured agreement
    for r in results:
        if r is None:
            continue
        name, raw_block = r
        provider_blocks[name] = raw_block
        # UI stores the clean SOURCE:: text; only synthesis sees the provider tag.
        db.add(Message(
            chat_id=chat_id,
            role="assistant",
            sender=name,
            text=raw_block,
            reply_group_id=group,
            include_in_summary=False,  # never in summary
            accepted=False,            # can be accepted
            signal_level=None
        ))
        extracted_blocks.append(tag_with_provider(name, raw_block))

    # §3.2: provider messages are staged but NOT committed here — they commit
    # atomically with the synthesis below (all-or-nothing).

    # ADDED — guard against total provider failure
    if not extracted_blocks:
        db.rollback()  # discard anything staged; the fallback is its own clean unit
        print("[LLM] All extraction providers failed. Falling back to direct answer.")
        try:
            fallback_text = await asyncio.to_thread(ask_direct_answer, prompt)

            db.add(Message(
                chat_id=chat_id,
                role="assistant",
                sender="clarity-stack",
                text=fallback_text,
                reply_group_id=group,
                include_in_summary=False,
                accepted=True,
                signal_level=signal
            ))
            db.commit()

            return {
                "status": "ok",
                "reply_group_id": group,
                "note": "fallback_direct_answer"
            }
        except Exception as e:
            db.rollback()
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "detail": f"All AI providers are currently unavailable: {str(e)}"
                }
            )

    # 4. Synthesis: run the (blocking) LLM merge off the event loop (§2.5), then
    #    persist the whole AI unit ATOMICALLY (§3.2). Provider messages + Synthesis
    #    row + synthesis Message commit together or not at all; on failure we roll
    #    the unit back (the user message, committed earlier, survives).
    #    NOTE: temperature=0 on a hosted LLM is NOT bit-reproducible (§8.1 / §11.6).
    try:
        content = await asyncio.to_thread(
            synthesize_content, extracted_blocks, strict_conflict=not payload.ask_anyway
        )

        # §10.3 / §11.4: replace the LLM's self-reported CONFIDENCE with the agreement
        # actually MEASURED across the ensemble's independent answers. Pure/CPU-only,
        # so no to_thread needed. `agreement["score"]` (0..1 or None) also stamps the
        # KG nodes below.
        agreement = compute_agreement(provider_blocks)
        content = apply_measured_confidence(content, agreement)

        synth = save_or_update_synthesis(
            db=db,
            chat_id=chat_id,
            reply_group_id=group,
            content=content,
            model_used=SYNTHESIS_MODEL,
            commit=False,    # commit together with the provider messages, below
            build_kg=False,  # KG is a derived follow-on, built after the commit
        )
        db.add(build_synthesis_message(chat_id, group, synth))  # §3.4 single factory
        db.commit()
        synthesis_id = synth.id
    except ConflictGateError as e:
        # §16.5: the ensemble succeeded but its CONFLICT couldn't be lexically confirmed
        # as a real opposition. This is RECOVERABLE — don't 503 a possibly-valid answer.
        # Roll the AI unit back AND delete the user turn we committed earlier, so an
        # "Ask Anyway" retry (re-posts the same text with ask_anyway=true) leaves no
        # duplicate user message. Nothing else was committed, so the turn fully resets.
        db.rollback()
        db.query(Message).filter(Message.id == user.id).delete()
        db.commit()
        return {
            "status": "conflict_gate",
            "can_retry_ask_anyway": True,
            "detail": (
                "Synthesis was held back: the models surfaced a CONFLICT the validator "
                "couldn't confirm as a genuine opposition. Re-run with Ask Anyway to accept it."
            ),
        }
    except Exception as e:
        db.rollback()
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={"status": "error", "detail": f"Synthesis failed: {str(e)}"}
        )

    # 5. Derived KG build — best-effort follow-on; never breaks the response.
    #    §10.3: stamp each node with the measured agreement score (0..1 / None).
    try:
        build_kg_for_synthesis(db, chat_id, synthesis_id, content,
                               node_confidence=agreement.get("score"))
    except Exception as e:
        db.rollback()
        print(f"[KG] build failed (non-fatal): {e}")

    print("SYNTHESIS SAVED TO DB:", synthesis_id)

    return {
        "status": "ok",
        "reply_group_id": group,
        "synthesis_id": synthesis_id
    }

class AcceptUpdate(BaseModel):
    accepted: bool


@app.post("/messages/{message_id}/accept")
def accept_message(
    message_id: str,
    payload: AcceptUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    # Verify caller can access the parent project
    get_chat_or_403(db, msg.chat_id, current_user["email"])

    if msg.role != "assistant":
        raise HTTPException(status_code=400, detail="Only assistant messages can be accepted")

    if payload.accepted is False:
        msg.accepted = False
        db.commit()
        return {"ok": True}

    if msg.reply_group_id:
        db.query(Message).filter(
            Message.reply_group_id == msg.reply_group_id,
            Message.role == "assistant",
            Message.id != msg.id
        ).update({Message.accepted: False}, synchronize_session=False)

    msg.accepted = True
    db.commit()

    return {"ok": True}


# NOTE (§6.2 / §11.3 / §4.3): signal classification lives in `signal_classify`
# (trained DistilBERT + heuristic fallback), imported at the top of this file — that is
# the live path. A stale inline keyword heuristic (`count_signal_words` + `normalize` /
# `fuzzy_ratio` / `is_similar` / `TECH_KEYWORDS` / `STOPWORDS`) once shadowed it and was
# left dead after the shadow was removed; it has now been purged (§4.3 hot-path dup gone).

@app.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_email = current_user["email"]
    project = get_project_or_403(db, project_id, user_email)
    # Only the owner or a PM can update project metadata
    is_pm = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_email == user_email,
        ProjectMember.role == "pm"
    ).first()
    if project.owner != user_email and not is_pm:
        raise HTTPException(status_code=403, detail="Only project owner or PM can edit project details")

    # NOTE: `owner` is intentionally NOT editable here. Allowing it let a PM set
    # themselves as owner (privilege escalation, §5.2). Ownership transfer must be a
    # separate, owner-only, audited action.
    allowed = {"purpose", "success_criteria", "constraints"}
    for key, value in payload.items():
        if key in allowed:
            setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project

from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session

# make sure ChatOut + Chat + get_db are already imported

@app.get("/chats/{chat_id}", response_model=ChatOut)
def get_chat(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    chat = get_chat_or_403(db, chat_id, current_user["email"])
    return chat

from typing import Optional
from pydantic import BaseModel

class ChatUpdate(BaseModel):
    title: Optional[str] = None
    purpose: Optional[str] = None
    phase: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None

    class Config:
        extra = "ignore"   # ignore unknown fields

from typing import List
from fastapi import Depends
from sqlalchemy.orm import Session



@app.patch("/chats/{chat_id}", response_model=ChatOut)
def update_chat(
    chat_id: str,
    payload: ChatUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    chat = get_chat_or_403(db, chat_id, current_user["email"])
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(chat, key, value)
    db.commit()
    db.refresh(chat)
    return chat

from typing import List
from fastapi import Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Message
from schemas import MessageSchema   # <-- your existing Pydantic schema


@app.get("/chats/{chat_id}/accepted", response_model=List[MessageSchema])
async def get_accepted_messages(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"])
    return (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.role == "assistant",
            Message.accepted.is_(True),
        )
        .order_by(Message.created_at.asc())
        .all()
    )


@app.get("/chats/{chat_id}/user", response_model=List[MessageSchema])
async def get_user_messages(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"])
    return (
        db.query(Message)
        .filter(Message.chat_id == chat_id, Message.role == "user")
        .order_by(Message.created_at.asc())
        .all()
    )


# =========================
# SYNTHESIS ROUTES
# =========================

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from synthesis_service import (
    save_or_update_synthesis,
    get_synthesis,
    list_synthesis_for_chat
)

from pydantic import BaseModel


class SynthesisCreatePayload(BaseModel):
    reply_group_id: str
    content: str
    model_used: str | None = None


class SynthesisResponse(BaseModel):
    id: str
    chat_id: str
    reply_group_id: str
    content: str
    model_used: str | None

    class Config:
        from_attributes = True


@app.post("/chats/{chat_id}/synthesis", response_model=SynthesisResponse)
def create_or_update_synthesis(
    chat_id: str,
    payload: SynthesisCreatePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"])
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Synthesis content cannot be empty")

    synthesis = save_or_update_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=payload.reply_group_id,
        content=payload.content,
        model_used=payload.model_used,
    )

    return synthesis

from prompts.synthesis_prompt import SYNTHESIS_SYSTEM_PROMPT, SYNTHESIS_USER_PROMPT_TEMPLATE


@app.get("/chats/{chat_id}/synthesis", response_model=list[SynthesisResponse])
def list_chat_synthesis(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)
    return list_synthesis_for_chat(db, chat_id)


@app.get("/chats/{chat_id}/synthesis/{reply_group_id}", response_model=SynthesisResponse)
def get_chat_synthesis(
    chat_id: str,
    reply_group_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)
    synthesis = get_synthesis(db, chat_id, reply_group_id)
    if not synthesis:
        raise HTTPException(status_code=404, detail="Synthesis not found")

    return synthesis


class ReplyGroupInput(BaseModel):
    reply_group_id: str
    # §16.5 Ask-Anyway override (same semantics as /ask): relax the conflict-semantics gate.
    ask_anyway: bool = False


from models import Message

def get_assistant_replies(db: Session, reply_group_id: str):
    return (
        db.query(Message)
        .filter(
            Message.reply_group_id == reply_group_id,
            Message.role == "assistant",
            Message.sender != "synthesis"
        )
        .order_by(Message.created_at.asc())
        .all()
    )

from synthesis_service import generate_and_store_synthesis



@app.post("/chats/{chat_id}/synthesis/generate", response_model=SynthesisResponse)
def generate_synthesis(
    chat_id: str,
    payload: ReplyGroupInput,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    _rl: None = Depends(RateLimiter(20, 60, "synthesis"))
):
    # Members-only: this triggers a paid LLM synthesis call (no allow_public).
    get_chat_or_403(db, chat_id, current_user["email"])
    replies = get_assistant_replies(db, payload.reply_group_id)

    if not replies:
        raise HTTPException(status_code=404, detail="No assistant replies for this group")

    try:
        synthesis = generate_and_store_synthesis(
            db=db,
            chat_id=chat_id,
            reply_group_id=payload.reply_group_id,
            assistant_replies=[r.text for r in replies],
            strict_conflict=not payload.ask_anyway,
        )
    except ConflictGateError:
        # §16.5: recoverable — tell the client it can retry with ask_anyway instead of
        # surfacing a hard failure for what may be a perfectly valid synthesis. Return a
        # JSONResponse so this bypasses the SynthesisResponse response_model.
        db.rollback()
        from fastapi.responses import JSONResponse
        return JSONResponse(content={
            "status": "conflict_gate",
            "can_retry_ask_anyway": True,
            "detail": (
                "Synthesis was held back over an unconfirmed CONFLICT. "
                "Re-run with Ask Anyway to accept it."
            ),
        })

    if not synthesis.content.strip():
        raise HTTPException(status_code=500, detail="Synthesis generation failed")


    # 👇 Make it visible in chat UI — identical row shape to /ask (§3.4 factory)
    synth_msg = build_synthesis_message(chat_id, payload.reply_group_id, synthesis)
    db.add(synth_msg)
    db.commit()
    db.refresh(synth_msg)

    return synthesis


from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from reasoning_queries import get_decision_explanation
from reasoning_queries import get_decision_explanation

@app.get("/api/reasoning/chat/{chat_id}")
def get_reasoning(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"])
    data = get_decision_explanation(db, chat_id)

    from fastapi.encoders import jsonable_encoder
    return jsonable_encoder({
        "decision": data["decision"],
        "supports": data["supports"],
        "conflicts": data["conflicts"],
        "blockers": data["blockers"],
        "alternatives": data["alternatives"],
        "others": data.get("others", []),
        "edges": data.get("edges", []),
    })


@app.get("/chats/{chat_id}/decision-trace")
def get_decision_trace_route(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """"Why this decision?" (§17.4): edge-grounded explanation per decision.

    Reads the semantic KnowledgeEdges (§16.2 fix) into each DECISION node, so a decision
    lists only the evidence/conflicts it is actually linked to — with the shared terms
    that justified each link. Pure DB read; no model call.
    """
    get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)
    from reasoning_queries import get_decision_trace
    from fastapi.encoders import jsonable_encoder
    return jsonable_encoder({"decisions": get_decision_trace(db, chat_id)})


@app.get("/chats/{chat_id}/decision-readiness")
def get_decision_readiness_route(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Decision Readiness (§17.5): per-decision "is this ready to act on, and if not,
    what's the cheapest path?" — fuses measured agreement (§10.3) + the semantic KG
    edges (§17.4) into a verdict and a prioritized resolve-path. Pure read; no model call.
    """
    get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)
    from decision_readiness import compute_readiness
    from fastapi.encoders import jsonable_encoder
    return jsonable_encoder({"decisions": compute_readiness(db, chat_id)})


@app.get("/chats/{chat_id}/synthesis/{reply_group_id}/disagreement")
def get_disagreement(
    chat_id: str,
    reply_group_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Disagreement Spotlight: recompute, on demand, WHERE the ensemble diverged.

    The per-provider extraction blocks are already persisted as assistant Messages
    at /ask time (sender = honest model label, same reply_group_id). We reconstruct
    {model: IR} from them and run the same Jaccard-cluster agreement engine that
    backs measured confidence — so this needs NO extra model calls, NO new column.
    'contested' claims are those NOT extracted by every model; support==1 means only
    a single model surfaced it (the strongest signal for human review).
    """
    get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)

    rows = db.query(Message).filter(
        Message.chat_id == chat_id,
        Message.reply_group_id == reply_group_id,
        Message.role == "assistant",
        Message.sender.notin_(["synthesis", "clarity-stack"]),
    ).all()
    provider_blocks = {r.sender: r.text for r in rows if r.sender and r.text}

    from agreement import analyze_claims, compute_agreement
    claims = analyze_claims(provider_blocks)
    return {
        "n_models": len(provider_blocks),
        "models": sorted(provider_blocks.keys()),
        "overall": compute_agreement(provider_blocks),
        "claims": claims,
        "contested": [c for c in claims if c["contested"]],
    }


@app.get("/chats/{chat_id}/synthesis/{reply_group_id}/devils-advocate")
def get_devils_advocate(
    chat_id: str,
    reply_group_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    _rl: None = Depends(RateLimiter(10, 60, "devils_advocate")),
):
    """Devil's Advocate (§17.2): on-demand red-team of a synthesis's DECISION.

    Argues the OTHER side of a committed decision — risks, unstated assumptions,
    failure modes, the strongest counter-argument — so a choice gets stress-tested
    before it's relied on. Members-only (NO allow_public) and rate-limited because it
    triggers a paid LLM call. Computed from the stored synthesis content (no migration).
    """
    get_chat_or_403(db, chat_id, current_user["email"])
    synth = get_synthesis(db, chat_id, reply_group_id)
    if not synth:
        raise HTTPException(status_code=404, detail="Synthesis not found")

    from devils_advocate import generate_devils_advocate
    try:
        return generate_devils_advocate(synth.content)
    except Exception as e:
        # §16.7: a failed critique must surface as an error, never be stored/shown as
        # if the model had nothing to say.
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={
            "status": "error",
            "detail": f"Devil's Advocate is temporarily unavailable: {str(e)}",
        })


# Register CORSMiddleware at the end of the file so it executes first,
# avoiding the Starlette BaseHTTPMiddleware CORS preflight bug.
origins = [
    "http://localhost:8000",
    "http://localhost:8001",
    "http://localhost:8002",
    "http://localhost:8003",
    "http://localhost:8004",
    "http://localhost:8005",
    "http://localhost:8006",
    "http://localhost:8007",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8002",
    "http://127.0.0.1:8003",
    "http://127.0.0.1:8004",
    "http://127.0.0.1:8005",
    "http://127.0.0.1:8006",
    "http://127.0.0.1:8007",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# WEBSOCKET: Real-Time Chat Presence & Typing Indicators
# ─────────────────────────────────────────────────────────────────────────────

# SECRET_KEY and ALGORITHM already imported from auth at the top of the file.
from jose import jwt, JWTError
from http.cookies import SimpleCookie
import json
from typing import Dict, Set


class ChatPresenceManager:
    """Tracks which users (identified by email) are connected to which chat room."""

    def __init__(self):
        # chat_id -> { email: WebSocket }
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, chat_id: str, user_email: str, websocket: WebSocket):
        await websocket.accept()
        if chat_id not in self.rooms:
            self.rooms[chat_id] = {}
        self.rooms[chat_id][user_email] = websocket

    def disconnect(self, chat_id: str, user_email: str):
        room = self.rooms.get(chat_id, {})
        room.pop(user_email, None)
        if not room:
            self.rooms.pop(chat_id, None)

    async def broadcast(self, chat_id: str, sender_email: str, message: dict):
        """Send to all connected users in the room EXCEPT the sender."""
        room = self.rooms.get(chat_id, {})
        dead = []
        for email, ws in room.items():
            if email == sender_email:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(email)
        for email in dead:
            room.pop(email, None)

    def get_presence(self, chat_id: str) -> list:
        """Return list of currently connected user emails for a room."""
        return list(self.rooms.get(chat_id, {}).keys())


presence_manager = ChatPresenceManager()


@app.websocket("/ws/chats/{chat_id}")
async def chat_websocket_endpoint(
    websocket: WebSocket,
    chat_id: str,
    token: str = Query(None),   # §5.4: query-param kept for backward compat only
):
    """
    WebSocket endpoint for real-time chat presence.
    Auth: httpOnly cookie (preferred) or ?token= query param (legacy/fallback).
    Protocol events (JSON):
      Client -> Server: { "type": "typing_start" | "typing_stop" }
      Server -> Client: { "type": "user_joined" | "user_left" | "typing_start" | "typing_stop"
                          | "presence_sync", "user": email, "nickname": str, "users": [...] }
    """
    # ── 1. Authenticate (cookie-first, query-param fallback) ─────────────────
    ws_token = None

    # Try cookie from the WS upgrade request
    cookie_header = websocket.headers.get("cookie", "")
    if cookie_header:
        sc = SimpleCookie(cookie_header)
        if "access_token" in sc:
            ws_token = sc["access_token"].value

    # Fallback: legacy query param (will be removed in future)
    if not ws_token and token:
        ws_token = token

    if not ws_token:
        await websocket.close(code=4001)  # Unauthorized
        return

    try:
        payload = jwt.decode(ws_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email = payload.get("sub")
        nickname = payload.get("nickname") or user_email.split("@")[0] if user_email else "User"
        if not user_email:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    # ── 2. Authorise against the chat's parent project ──────────────────────────
    db: Session = next(get_db())
    try:
        get_chat_or_403(db, chat_id, user_email, allow_public=True)
    except HTTPException:
        await websocket.close(code=4003)  # Forbidden
        db.close()
        return
    finally:
        db.close()

    # ── 3. Join room ─────────────────────────────────────────────────────────
    await presence_manager.connect(chat_id, user_email, websocket)

    # Notify others: user joined
    await presence_manager.broadcast(chat_id, user_email, {
        "type": "user_joined",
        "user": user_email,
        "nickname": nickname,
    })

    # Send current room snapshot to the newly joined user
    await websocket.send_text(json.dumps({
        "type": "presence_sync",
        "users": presence_manager.get_presence(chat_id),
    }))

    # ── 4. Message Loop ──────────────────────────────────────────────────────
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event_type = data.get("type")
            if event_type in ("typing_start", "typing_stop"):
                await presence_manager.broadcast(chat_id, user_email, {
                    "type": event_type,
                    "user": user_email,
                    "nickname": nickname,
                })

    except WebSocketDisconnect:
        pass
    finally:
        presence_manager.disconnect(chat_id, user_email)
        await presence_manager.broadcast(chat_id, user_email, {
            "type": "user_left",
            "user": user_email,
            "nickname": nickname,
        })

