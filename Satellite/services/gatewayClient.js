// services/gatewayClient.js — route Satellite LLM calls through the central
// Clarity gateway (§10.2) so they share the same cache / circuit breaker / token
// budget / stats as the rest of the system instead of hitting vendors directly.
//
// This is a thin client: callers (hfClient, modelRouter) try it first and fall back
// to their own direct-vendor path if the gateway is not configured or unreachable —
// so the Satellite never hard-depends on the Backend being up.
const axios = require("axios");

const GATEWAY_URL = process.env.CLARITY_GATEWAY_URL;       // e.g. http://localhost:8000
const GATEWAY_TOKEN = process.env.GATEWAY_SERVICE_TOKEN;

function gatewayEnabled() {
  return Boolean(GATEWAY_URL && GATEWAY_TOKEN);
}

/**
 * Call the central gateway and return the assistant text (string).
 * Throws on any failure so the caller can fall back to its direct path.
 *
 * opts: { candidates?, provider?, model?, temperature?, max_tokens?,
 *         response_format?, tenant?, tags? }
 *  - pass `candidates` (ordered [{provider, model}, ...]) for a fallback chain, OR
 *  - pass `provider` + `model` for a single target.
 */
async function gatewayChat(messages, opts = {}) {
  if (!gatewayEnabled()) throw new Error("gateway not configured");

  const {
    candidates, provider, model, temperature = 0.2,
    max_tokens, response_format, tenant, tags,
  } = opts;

  const body = { messages, temperature, max_tokens, response_format, tenant, tags };
  if (candidates && candidates.length) body.candidates = candidates;
  else { body.provider = provider; body.model = model; }

  const res = await axios.post(
    `${GATEWAY_URL.replace(/\/$/, "")}/llm/chat`,
    body,
    {
      headers: { "X-Service-Token": GATEWAY_TOKEN, "Content-Type": "application/json" },
      timeout: 120000,
    }
  );
  return res.data.content;
}

module.exports = { gatewayEnabled, gatewayChat };
