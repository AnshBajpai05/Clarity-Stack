# Auth Operational Hardening Walkthrough (§1.7)

> **Branch:** `UI_enhanced` · **Date:** 2026-06-28
> **Cross-ref:** `existing_issues.md §1.7`, `issue_fixed.md §D`

## Summary

Completed all seven auth hardening improvements on top of the §5.4 hybrid cookie auth system.

---

## What Was Done

### 1. Stateful Refresh Tokens with Rotation

**`Backend/models.py`** — New `RefreshToken` table:
- `id` / JTI (UUID primary key)
- `user_id` (FK → users, CASCADE)
- `issued_at`, `expires_at`, `revoked`, `device_info`

**`Backend/auth.py`** — `create_refresh_token` now returns `(token, jti)`:
- JTI embedded in JWT payload (`"jti": uuid4()`)

**`Backend/main.py`** — `/api/auth/refresh`:
- Verifies JTI exists and isn't revoked in DB
- Marks old token `revoked=True`
- Issues fresh `(access_token, refresh_token, csrf_token)` pair
- Stores new session in DB

**Anomaly detection**: If a revoked JTI is presented (replay attack), **all sessions** for that user are wiped immediately.

**DB Migration**: `0029088d6806_add_refresh_tokens.py` — applied cleanly via `alembic upgrade head`.

---

### 2. Richer `/me` Endpoint

`GET /api/auth/me` now returns:
```json
{
  "id": "...",
  "email": "user@example.com",
  "role": "user",
  "nickname": "user",
  "permissions": [],
  "avatar": "",
  "createdAt": "..."
}
```
Admins receive `permissions: ["project.read", "project.write", "project.delete", "users.manage"]`.

---

### 3. RBAC Middleware

**`Backend/auth.py`** — `require_permissions(*permissions)`:
```python
# Usage in any route:
@app.delete("/api/admin/users/{id}")
def admin_delete(user = Depends(require_permissions("admin"))):
    ...
```
Role-to-permission map is centralized. Project-scoped access still goes through `get_project_or_403`.

---

### 4. `__Host-` Cookie Prefixes (Production)

**`Backend/auth.py`** — `get_cookie_name(base)`:
- In production (`ENVIRONMENT=production`): returns `__Host-access_token`, etc.
- In dev: returns plain `access_token`
- All `set_cookie`, `delete_cookie`, and `request.cookies.get` calls use this helper

**`Web/Frontend/src/lib/http.ts`** — `getCookie(name)`:
- Checks `__Host-{name}` first, then plain `{name}` — works in both prod and dev without env flags.

---

### 5. Rate Limiting on Auth Endpoints

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 / min |
| `POST /api/auth/register` | 5 / min |
| `POST /api/auth/refresh` | **20 / min** *(new)* |

---

### 6. Silent Token Refresh (Frontend)

**`Web/Frontend/src/lib/http.ts`** — Full state machine:

```
Request → 401 Response
  ↓
Already refreshing? → Queue request (Promise)
  ↓
Call /api/auth/refresh
  ↓ success         ↓ failure
Retry all queued  → window.location = /login
  ↓
Transparent to user
```

**`Web/Frontend/src/lib/api.ts`** — `fetchSatellite`:
- On 401: calls `api("/api/auth/refresh")` (triggers state machine), then retries the Satellite call
- Falls back to `/login` only if refresh itself fails

---

## Verification

- ✅ `alembic upgrade head` — migration `0029088d6806` applied cleanly
- ✅ `npm run build` — zero TS errors, clean production bundle (3586 modules)
- 📋 Manual verification steps:
  1. Log in → inspect cookies for `access_token`, `refresh_token`, `csrf_token`
  2. Manually expire access token (wait 15 min or edit JWT exp) → make an API call → should silently refresh, not redirect
  3. Use the same refresh token twice (replay) → second attempt should get 401 + all sessions revoked
  4. Call `GET /api/auth/me` → verify full profile returned

---

## Files Changed

| File | Change |
|---|---|
| `Backend/models.py` | +`RefreshToken` model |
| `Backend/auth.py` | `jti` in `create_refresh_token`, `get_cookie_name`, `require_permissions` RBAC |
| `Backend/main.py` | Stateful `/refresh`, richer `/me`, DB-revoke on `/logout`, rate-limit `/refresh` |
| `Backend/migrations/versions/0029088d6806_add_refresh_tokens.py` | Alembic migration for `refresh_tokens` table |
| `Web/Frontend/src/lib/http.ts` | Silent refresh interceptor, `__Host-` prefix in `getCookie` |
| `Web/Frontend/src/lib/api.ts` | `fetchSatellite` 401 → silent refresh, not hard redirect |
