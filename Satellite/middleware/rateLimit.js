// middleware/rateLimit.js — lightweight in-memory rate limiter (§5.6)
//
// Sliding-window counter keyed on (scope, client-IP), so expensive/abusable routes
// (LLM generation) can't be hammered for financial-DoS. NOTE: per-process state —
// move to Redis when running more than one Satellite instance (§10.9).

const buckets = new Map();

/**
 * @param {number} maxCalls  max requests allowed within the window
 * @param {number} windowMs  window size in milliseconds
 * @param {string} scope     bucket namespace (defaults to the route path)
 */
function rateLimit(maxCalls, windowMs, scope = "") {
  return (req, res, next) => {
    const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
    const key = `${scope || req.baseUrl + req.path}:${ip}`;
    const now = Date.now();

    let dq = buckets.get(key);
    if (!dq) {
      dq = [];
      buckets.set(key, dq);
    }

    const cutoff = now - windowMs;
    while (dq.length && dq[0] <= cutoff) dq.shift();

    if (dq.length >= maxCalls) {
      const retry = Math.ceil((dq[0] + windowMs - now) / 1000);
      res.set("Retry-After", String(retry));
      return res.status(429).json({ error: "Too many requests — please slow down." });
    }

    dq.push(now);
    next();
  };
}

module.exports = { rateLimit };
