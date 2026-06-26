from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from datetime import datetime

from database import get_db
from models import Project

from providers import ask_groq, ask_gemini, ask_hf, ask_direct_answer
from uuid import uuid4
from signal_classify import classify_signal
from synthesis_service import generate_and_store_synthesis
from auth import hash_password, verify_password, create_access_token, get_current_user
from models import User
from pydantic import BaseModel, EmailStr



app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

from database import engine
from models import Base

Base.metadata.create_all(bind=engine)

# ---------- Health ----------
@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    return {"status": "ok"}

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

@app.post("/api/auth/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
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
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"email": db_user.email})

    return {
        "access_token": token,
        "token_type": "bearer",
    }


class ClientLogin(BaseModel):
    project_id: str

@app.post("/api/auth/client-login")
def client_login(payload: ClientLogin, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    token = create_access_token({
        "email": f"client_{payload.project_id}",
        "role": "client",
        "project_id": payload.project_id
    })
    return {
        "access_token": token,
        "token_type": "bearer",
    }



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

    if status == "accepted":
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
from sqlalchemy.exc import SQLAlchemyError
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

    except Exception as e:
        # store quarantine record
        qm = QuarantinedMessage(
            chat_id=chat_id,
            raw_payload=json.dumps(payload.model_dump(), default=str),
            error_reason=str(e)
        )
        db.add(qm)
        db.commit()

        raise HTTPException(status_code=400, detail="Message rejected & quarantined for review")



@app.get("/chats/{chat_id}/messages", response_model=List[MessageOut])
def list_messages(
    chat_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    chat = get_chat_or_403(db, chat_id, current_user["email"], allow_public=True)

    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc())   # NEW — latest first
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
        # Call satellite
        resp = requests.post("http://127.0.0.1:8003/api/satellite/internal/cleanup", json=payload, headers=headers, timeout=5)
        
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

# --- Basic logger setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()

    try:
        response = await call_next(request)
    except Exception as e:
        logging.exception(f"❌ ERROR handling request {request.method} {request.url}")
        raise e

    process_time = (start_time - time.time()) * -1000

    logging.info(
        f"➡ {request.method} {request.url.path} "
        f"→ {response.status_code} "
        f"({process_time:.2f} ms)"
    )

    return response


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
    
def tag_with_provider(provider: str, block: str) -> str:
    return block.replace("- SOURCE::", f"- {provider.upper()}::")


@app.post("/chats/{chat_id}/ask")
def ask_multi_model(
    chat_id: str,
    payload: AskPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    get_chat_or_403(db, chat_id, current_user["email"])

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

    # 2. Noise filter
    if signal == "noise":
        default_reply = Message(
            chat_id=chat_id,
            role="assistant",
            sender="clarity-stack",
            text=(
                "This message looks like it contains very little actionable project "
                "context — so it wasn't added to your working summary.\n\n"
                "If this was important, please resend it with more details 🙂"
            ),
            include_in_summary=False,
            accepted=False,
            signal_level=None
        )
        db.add(default_reply)
        db.commit()
        return {"status": "noise_filtered"}

    # 3. Multi-model tagged extraction
    group = str(uuid4())

    # --- 🆕 CONTEXT INJECTION START ---
    from context_builder import build_chat_context
    history_block = build_chat_context(db, chat_id, limit=10)
    
    # Prepend history to the current user prompt
    prompt = f"{history_block}\n\n=== CURRENT USER REQUEST ===\n{payload.text}"
    # --- CONTEXT INJECTION END ---

    providers = [
        ("groq", ask_groq),
        ("gemini", ask_gemini),        # mocked
        ("huggingface", ask_hf),
    ]

    ai_msgs = []
    extracted_blocks = []

    for name, fn in providers:
        try:
            raw_block = fn(prompt)   # returns SOURCE:: tagged text
            if not raw_block or not raw_block.strip():
                raise ValueError("Empty model output")

            # 👇 Only synthesis sees provider names
            tagged_block = tag_with_provider(name, raw_block)

            # 👇 UI stores clean SOURCE:: version
            m = Message(
                chat_id=chat_id,
                role="assistant",
                sender=name,
                text=raw_block,
                reply_group_id=group,
                include_in_summary=False,  # never in summary
                accepted=False,            # can be accepted
                signal_level=None
            )

            db.add(m)
            ai_msgs.append(m)
            extracted_blocks.append(tagged_block)

        except Exception as e:
            print(f"[LLM] Provider '{name}' failed: {e}")
            continue

    db.commit()
    for m in ai_msgs:
        db.refresh(m)

    # ADDED — guard against total provider failure
    if not extracted_blocks:
        print("[LLM] All extraction providers failed. Falling back to direct answer.")
        try:
            fallback_text = ask_direct_answer(prompt)
            
            # Create a simple synthesis-like message for the fallback
            synth_msg = Message(
                chat_id=chat_id,
                role="assistant",
                sender="clarity-stack",
                text=fallback_text,
                reply_group_id=group,
                include_in_summary=False,
                accepted=True,
                signal_level=signal
            )
            db.add(synth_msg)
            db.commit()
            db.refresh(synth_msg)
            
            return {
                "status": "ok",
                "reply_group_id": group,
                "note": "fallback_direct_answer"
            }
        except Exception as e:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=503,
                content={
                    "status": "error",
                    "detail": f"All AI providers are currently unavailable: {str(e)}"
                }
            )

    # 4. Deterministic synthesis (compiler-grade merge)
    try:
        synth = generate_and_store_synthesis(
            db=db,
            chat_id=chat_id,
            reply_group_id=group,
            assistant_replies=extracted_blocks
        )
    except RuntimeError as e:
        return {
            "status": "synthesis_validation_failed",
            "reply_group_id": group,
            "error": str(e)
        }


    synth_msg = Message(
        chat_id=chat_id,
        role="synthesis",
        sender="synthesis",
        type="synthesis",
        text=synth.content,
        reply_group_id=group,
        synthesis_id=synth.id,        # 🔥 THIS IS THE MISSING WIRE
        include_in_summary=True,
        accepted=True,
        signal_level="high"
    )



    db.add(synth_msg)
    db.commit()
    db.refresh(synth_msg)

    print("SYNTHESIS SAVED TO DB:", synth_msg.id)

    return {
        "status": "ok",
        "reply_group_id": group,
        "synthesis_id": synth.id
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
import re
from difflib import SequenceMatcher

TECH_KEYWORDS = [
    "deploy","database","db","pipeline","model","training","frontend",
    "backend","api","server","auth","docker","kubernetes","config",
    "query","optimize","latency","testing","bug","issue","crash",
    "risk","security","security","vulnerability","threat","cost","limit",
    "performance","scalability","architecture","design","requirement"
]

STOPWORDS = set([
    "the","a","an","to","and","or","of","in","for","non",
    "on","at","is","are","am","be","was","were",
    "it","this","that","i","you"
])


def normalize(text: str):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fuzzy_ratio(a, b):
    return SequenceMatcher(None, a, b).ratio()


def is_similar(word, keyword, threshold=0.80):
    return fuzzy_ratio(word, keyword) >= threshold


def count_signal_words(text: str):
    normalized_text = normalize(text)
    tokens = [t for t in normalized_text.split() if t not in STOPWORDS]
    score = 0

    # Question bonus
    if any(q in normalized_text for q in ["what", "how", "why", "when", "where", "who", "?"]):
        score += 2

    for t in tokens:
        # match tech keywords fuzzily
        for kw in TECH_KEYWORDS:
            if is_similar(t, kw):
                score += 2
                break

        # informative long word bonus
        if len(t) >= 7:
            score += 1

    return score


def classify_signal(text: str):
    score = count_signal_words(text)

    if score >= 6:
        return "high"
    if score >= 3:
        return "medium"
    if score >= 1:
        return "low"

    return "noise"

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

    allowed = {"purpose", "success_criteria", "constraints", "owner"}
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
    db: Session = Depends(get_db)
):
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
    db: Session = Depends(get_db)
):
    return list_synthesis_for_chat(db, chat_id)


@app.get("/chats/{chat_id}/synthesis/{reply_group_id}", response_model=SynthesisResponse)
def get_chat_synthesis(
    chat_id: str,
    reply_group_id: str,
    db: Session = Depends(get_db)
):
    synthesis = get_synthesis(db, chat_id, reply_group_id)
    if not synthesis:
        raise HTTPException(status_code=404, detail="Synthesis not found")

    return synthesis


class ReplyGroupInput(BaseModel):
    reply_group_id: str


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
    db: Session = Depends(get_db)
):
    replies = get_assistant_replies(db, payload.reply_group_id)

    if not replies:
        raise HTTPException(status_code=404, detail="No assistant replies for this group")

    synthesis = generate_and_store_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=payload.reply_group_id,
        assistant_replies=[r.text for r in replies],
    )

    if not synthesis.content.strip():
        raise HTTPException(status_code=500, detail="Synthesis generation failed")


    # 👇 Make it visible in chat UI
    synth_msg = Message(
        chat_id=chat_id,
        role="assistant",
        sender="synthesis",
        text=synthesis.content,
        reply_group_id=payload.reply_group_id,
        include_in_summary=True,
        accepted=False,
        signal_level=None
    )


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

from auth import SECRET_KEY, ALGORITHM
from jose import jwt, JWTError
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
    token: str = Query(...),
):
    """
    WebSocket endpoint for real-time chat presence.
    Auth: JWT token passed as ?token= query param.
    Protocol events (JSON):
      Client -> Server: { "type": "typing_start" | "typing_stop" }
      Server -> Client: { "type": "user_joined" | "user_left" | "typing_start" | "typing_stop"
                          | "presence_sync", "user": email, "nickname": str, "users": [...] }
    """
    # ── 1. Authenticate ──────────────────────────────────────────────────────
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email = payload.get("sub")
        nickname = payload.get("nickname") or user_email.split("@")[0] if user_email else "User"
        if not user_email:
            await websocket.close(code=4001)  # Unauthorized
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

