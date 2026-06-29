"""
§5.4 — Hybrid Authentication (httpOnly cookies + Bearer header fallback)

Auth pipeline:  extractToken() → verifyToken() → loadUser() → req.user

Cookie layout (browser clients):
  access_token   httpOnly  Secure(prod)  SameSite=Lax     15 min
  refresh_token  httpOnly  Secure(prod)  SameSite=Strict  30 days
  csrf_token     readable  Secure(prod)  SameSite=Lax     30 days

Service-to-service: Authorization: Bearer <token>  (unchanged)
"""

from datetime import datetime, timedelta
from jose import jwt, JWTError
import bcrypt
import os
import secrets
from fastapi import Depends, HTTPException, Request, Response


# ── Secrets ───────────────────────────────────────────────────────────────────
# JWT_SECRET signs access & refresh JWTs.  Fail-closed if missing.
SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET environment variable is not set. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\" "
        "and add it to your .env file."
    )

ALGORITHM = "HS256"

# ── Token Lifetimes ───────────────────────────────────────────────────────────
ACCESS_TOKEN_EXPIRE_MINUTES = 15       # short-lived (was 60)
REFRESH_TOKEN_EXPIRE_DAYS = 30         # long-lived

# ── Cookie Settings ───────────────────────────────────────────────────────────
# Secure=True in production (HTTPS), False in local dev (HTTP).
_IS_PROD = os.getenv("ENVIRONMENT", "development").lower() in ("production", "prod")
COOKIE_SECURE = _IS_PROD
COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", None)  # None = auto (current host)

def get_cookie_name(base_name: str) -> str:
    """§1.7 Auth Hardening: Use __Host- prefixes in production."""
    # __Host- cookies must have Secure=True, Path=/, and no Domain attribute.
    if COOKIE_SECURE:
        return f"__Host-{base_name}"
    return base_name



# ── Password Hashing ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    pwd_bytes = password[:72].encode("utf-8")
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain[:72].encode("utf-8"), hashed.encode("utf-8"))


# ── Token Creation ────────────────────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """Mint a short-lived access JWT (15 min)."""
    to_encode = data.copy()
    to_encode.setdefault("sub", data.get("email"))
    to_encode.setdefault("role", "user")
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode["type"] = "access"
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict) -> tuple[str, str]:
    """Mint a long-lived refresh JWT (30 days). Returns (token, jti)."""
    import uuid
    jti = str(uuid.uuid4())
    to_encode = {
        "jti": jti,
        "sub": data.get("email"),
        "role": data.get("role", "user"),
        "type": "refresh",
        "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM), jti


def generate_csrf_token() -> str:
    """Generate a purely random CSRF token (32 bytes, hex-encoded). No HMAC, no expiry."""
    return secrets.token_hex(32)


# ── Token Extraction (cookie-first, header-fallback) ─────────────────────────

def _extract_token_from_request(request: Request, token_type: str = "access") -> str | None:
    """
    Extract JWT from the request.  Priority:
      1. Cookie (`access_token` or `refresh_token`)
      2. Authorization: Bearer header (service-to-service)
    Returns (token_string, source) or (None, None).
    """
    cookie_name = get_cookie_name("access_token") if token_type == "access" else get_cookie_name("refresh_token")

    # 1. Cookie (browser clients)
    token = request.cookies.get(cookie_name)
    if token:
        return token

    # 2. Authorization header (service-to-service / legacy)
    if token_type == "access":
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]

    return None


def _is_cookie_auth(request: Request) -> bool:
    """True if the request carries an access_token cookie (→ CSRF enforcement needed)."""
    return get_cookie_name("access_token") in request.cookies


# ── Token Verification ────────────────────────────────────────────────────────

def _verify_token(token: str, expected_type: str = "access") -> dict:
    """
    Decode and verify a JWT.  Returns the payload dict.
    Raises HTTPException(401) on any failure.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Enforce token type (access vs refresh) to prevent cross-use
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=401, detail="Wrong token type")

    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token: missing subject")

    return payload


# ── CSRF Enforcement ──────────────────────────────────────────────────────────

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _enforce_csrf(request: Request) -> None:
    """
    Double-submit cookie CSRF check.  Only enforced when:
      - Auth came from a cookie (not a Bearer header)
      - Request method is mutating (POST/PATCH/PUT/DELETE)

    Compares the csrf_token cookie against the X-CSRF-Token header.
    """
    if request.method in _CSRF_SAFE_METHODS:
        return

    if not _is_cookie_auth(request):
        # Header-based auth isn't CSRF-vulnerable — headers prove origin control.
        return

    cookie_csrf = request.cookies.get(get_cookie_name("csrf_token"), "")
    header_csrf = request.headers.get("X-CSRF-Token", "")

    if not cookie_csrf or not header_csrf:
        raise HTTPException(status_code=403, detail="CSRF token missing")

    if not secrets.compare_digest(cookie_csrf, header_csrf):
        raise HTTPException(status_code=403, detail="CSRF token mismatch")


# ── User Loading (the public dependency) ──────────────────────────────────────

def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency: extractToken → verifyToken → loadUser → return user dict.
    Cookie-first, header-fallback.  CSRF enforced on cookie-authed mutations.
    """
    # 1. Extract
    token = _extract_token_from_request(request, token_type="access")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # 2. Verify
    payload = _verify_token(token, expected_type="access")

    # 3. CSRF (only for cookie-authed mutating requests)
    _enforce_csrf(request)

    # 4. Load user
    return {
        "email": payload["sub"],
        "role": payload.get("role", "user"),
    }


# ── Cookie Helpers ────────────────────────────────────────────────────────────

def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    """Set the three auth cookies on a Response."""
    response.set_cookie(
        key=get_cookie_name("access_token"),
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        domain=COOKIE_DOMAIN,
    )
    response.set_cookie(
        key=get_cookie_name("refresh_token"),
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth",       # only sent to auth endpoints (minimise exposure)
        domain=COOKIE_DOMAIN,
    )
    response.set_cookie(
        key=get_cookie_name("csrf_token"),
        value=csrf_token,
        httponly=False,          # JS must read this to send X-CSRF-Token header
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
        domain=COOKIE_DOMAIN,
    )


def clear_auth_cookies(response: Response) -> None:
    """Delete all three auth cookies."""
    for name in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(
            key=get_cookie_name(name),
            path="/" if name != "refresh_token" else "/api/auth",
            domain=COOKIE_DOMAIN,
        )

# ── RBAC Middleware ───────────────────────────────────────────────────────────

def require_permissions(*permissions: str):
    """
    §1.7 Auth Hardening: Reusable RBAC middleware.
    Usage in FastAPI route: user = Depends(require_permissions("admin"))
    """
    def dependency(request: Request, current_user: dict = Depends(get_current_user)):
        role_permissions = {
            "admin": ["admin", "project.read", "project.write", "project.delete", "users.manage"],
            "user": [] # Standard users get project-scoped permissions via get_project_or_403
        }
        
        user_role = current_user.get("role", "user")
        user_perms = role_permissions.get(user_role, [])
        
        for p in permissions:
            if p not in user_perms:
                raise HTTPException(status_code=403, detail=f"Missing permission: {p}")
        
        return current_user
    return dependency