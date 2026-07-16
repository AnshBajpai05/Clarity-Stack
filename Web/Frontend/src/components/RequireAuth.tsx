import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * Client-side route guard (§7.1).
 *
 * Previously every route rendered unconditionally and protection was implicit via
 * an API 401 → redirect — so unauthenticated users loaded protected shells, saw a
 * flash of empty UI, then a hard redirect. This guards the protected route group:
 * no token ⇒ redirect to /login immediately (remembering where they were headed).
 */
export function RequireAuth() {
  const location = useLocation();
  // Backend is Bearer-JWT only (no auth cookies) — same token lib/http.ts sends
  // as `Authorization: Bearer <token>` on every API call.
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
