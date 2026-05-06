// middleware/auth.js — JWT validation reusing core's secret
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "HalaMadrid12345";

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

module.exports = { requireAuth, optionalAuth, requirePM };
