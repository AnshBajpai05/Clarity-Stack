// config/env.js — validated environment loader (§6.3)
//
// One fail-fast schema for the Editor service. Aggregates every missing required
// var into a single, actionable boot error (replaces the old one-at-a-time
// JWT_SECRET throw). Optional vars carry safe local-dev defaults; Supabase is
// genuinely optional (file-based persistence is the fallback).

// key -> human description (shown in the boot error when missing)
const REQUIRED = {
  JWT_SECRET: "Shared HS256 secret — MUST match the Core Backend's JWT_SECRET.",
};

// key -> default (used when the var is absent/blank)
const OPTIONAL = {
  PORT: "8004",
  // §5.5: bind to localhost by default; set BIND_HOST=0.0.0.0 only behind a
  // reverse proxy / container.
  BIND_HOST: "127.0.0.1",
  CORS_ORIGINS:
    "http://localhost:8006,http://127.0.0.1:8006,http://localhost:8007,http://127.0.0.1:8007",
  // Supabase is an optional secondary backup; blank = use file persistence only.
  SUPABASE_URL: "",
  SUPABASE_KEY: "",
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
      "[Editor] Refusing to boot (fail-closed) — missing required environment " +
        "variable(s):\n" +
        missing.join("\n") +
        "\nSet them in Editor_Service/.env (matching the Core Backend's value)."
    );
  }

  for (const [key, def] of Object.entries(OPTIONAL)) {
    env[key] = (process.env[key] || def).trim();
  }

  env.PORT = parseInt(env.PORT, 10) || 8004;
  return env;
}

module.exports = { loadEnv };
