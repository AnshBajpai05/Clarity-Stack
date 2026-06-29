// config/env.js — validated environment loader (§6.3)
//
// One fail-fast schema for this service. Aggregates EVERY missing required var
// into a single, actionable boot error instead of failing one at a time (or, as
// before, booting and silently failing DB ops later). Optional vars carry safe
// local-dev defaults so a clean checkout runs without ceremony.

// key -> human description (shown in the boot error when missing)
const REQUIRED = {
  JWT_SECRET: "Shared HS256 secret — MUST match the Core Backend's JWT_SECRET.",
  MONGO_URI: "MongoDB connection string for the Satellite knowledge store.",
};

// key -> default (used when the var is absent/blank)
const OPTIONAL = {
  PORT: "8003",
  // §5.5: bind to localhost by default; set BIND_HOST=0.0.0.0 only when a reverse
  // proxy or container fronts the service (it should not be LAN-exposed directly).
  BIND_HOST: "127.0.0.1",
  CORE_API_URL: "http://127.0.0.1:8000",
  CORS_ORIGINS:
    "http://localhost:8006,http://127.0.0.1:8006,http://localhost:8007,http://127.0.0.1:8007",
};

function loadEnv() {
  const env = {};
  const missing = [];

  for (const [key, help] of Object.entries(REQUIRED)) {
    const val = (process.env[key] || "").trim();
    if (!val) missing.push(`  - ${key}: ${help}`);
    else env[key] = val;
  }

  if (missing.length) {
    throw new Error(
      "[Satellite] Refusing to boot (fail-closed) — missing required environment " +
        "variable(s):\n" +
        missing.join("\n") +
        "\nSet them in Satellite/.env (see SETUP_GUIDE)."
    );
  }

  for (const [key, def] of Object.entries(OPTIONAL)) {
    env[key] = (process.env[key] || def).trim();
  }

  env.PORT = parseInt(env.PORT, 10) || 8003;
  return env;
}

module.exports = { loadEnv };
