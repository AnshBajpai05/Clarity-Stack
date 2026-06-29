import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getCookie } from "../lib/http";

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
  // §5.4: We check for csrf_token (which is JS-readable) as a proxy for being logged in
  const token = getCookie("csrf_token");

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
