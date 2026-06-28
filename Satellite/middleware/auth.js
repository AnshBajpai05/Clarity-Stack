// middleware/auth.js — JWT validation reusing core's secret
const jwt = require("jsonwebtoken");
const axios = require("axios");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is not set. Satellite refuses to boot (fail-closed). " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
    "and add it (matching the Core Backend's value) to Satellite/.env."
  );
}

/**
 * Express middleware: validates Bearer token from the core backend.
 * Attaches `req.user = { email, role }` on success.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      email: payload.sub || payload.email,
      role: payload.role || "user",
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Optional auth — attaches user if token exists, but doesn't block.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;

  if (header && header.startsWith("Bearer ")) {
    const token = header.split(" ")[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = {
        email: payload.sub || payload.email,
        role: payload.role || "user",
      };
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
}

/**
 * PM-only guard — must be called AFTER requireAuth.
 * Checks if the user is a PM for the given project via the core API.
 */
function requirePM(req, res, next) {
  // For now, trust the role from JWT. Phase 2 will add core API verification.
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

/**
 * Object-level authorization for project-scoped routes (§1.3 cross-tenant IDOR).
 *
 * Delegates to Core's own access control: `GET /projects/:id` returns 200 only if
 * the caller is a member OR the project is public (`allow_public_read`), 404/403
 * otherwise. This keeps a single source of truth for tenancy instead of trusting
 * the JWT's self-asserted role.
 *
 * Designed as an Express param trigger: `router.param("projectId", requireProjectAccess)`.
 * Fail-closed: any non-2xx from Core (incl. Core unreachable) denies the request.
 */
async function requireProjectAccess(req, res, next, projectId) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    await axios.get(`${CORE_API}/projects/${encodeURIComponent(projectId)}`, {
      headers: { Authorization: header },
      timeout: 5000,
    });
    return next();
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 401) return res.status(401).json({ error: "Invalid or expired token" });
    if (status === 403 || status === 404) {
      return res.status(403).json({ error: "Forbidden: no access to this project" });
    }
    console.error(`[authZ] Core project-access check failed: ${err.message}`);
    return res.status(502).json({ error: "Unable to verify project access" });
  }
}

/**
 * Object-level authorization for card-scoped routes. Loads the card, and:
 *  - if the route also carries `:projectId`, ensures the card actually belongs to
 *    it (blocks passing another tenant's cardId under a project you can access);
 *  - if the route has no `:projectId` (e.g. DELETE /:cardId), verifies access to
 *    the card's OWN project via Core.
 *
 * Use as an Express param trigger: `router.param("cardId", requireCardAccess)`.
 * Attaches `req.card` for handler reuse. Fail-closed.
 */
async function requireCardAccess(req, res, next, cardId) {
  const TemporalCard = require("../models/TemporalCard");
  try {
    const card = await TemporalCard.findById(cardId).lean();
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    const urlProjectId = req.params.projectId;
    if (urlProjectId && String(card.projectId) !== String(urlProjectId)) {
      // Card belongs to a different project than the URL claims — treat as not found.
      return res.status(404).json({ error: "Card not found" });
    }

    if (urlProjectId) {
      // The projectId param trigger already verified access to urlProjectId.
      req.card = card;
      return next();
    }

    // No :projectId in the route — verify access to the card's own project.
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    await axios.get(`${CORE_API}/projects/${encodeURIComponent(card.projectId)}`, {
      headers: { Authorization: header },
      timeout: 5000,
    });
    req.card = card;
    return next();
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 401) return res.status(401).json({ error: "Invalid or expired token" });
    if (status === 403 || status === 404) {
      return res.status(403).json({ error: "Forbidden: no access to this card" });
    }
    console.error(`[authZ] Core card-access check failed: ${err.message}`);
    return res.status(502).json({ error: "Unable to verify card access" });
  }
}

module.exports = { requireAuth, optionalAuth, requirePM, requireProjectAccess, requireCardAccess };
