// §5.7 — Satellite OTel/Sentry init must be OPTIONAL and no-op unless switched on.
// With no OTEL_*/SENTRY_DSN env, require("../tracing") must return {tracing:false,
// sentry:false} WITHOUT importing the (uninstalled) OTel packages — that is what keeps
// a plain `npm install` lean and the boot path dependency-free. Run: `node --test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");

function freshTracing(env = {}) {
  for (const k of ["OTEL_TRACES_ENABLED", "OTEL_EXPORTER_OTLP_ENDPOINT", "SENTRY_DSN"]) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  delete require.cache[require.resolve("../tracing")];
  return require("../tracing");
}

test("disabled by default → no-op, no package import", () => {
  const t = freshTracing();
  assert.deepEqual(t, { tracing: false, sentry: false });
});

test("OTEL_TRACES_ENABLED with no SDK installed degrades to no-op (does not throw)", () => {
  // The packages aren't a base dependency, so initTracing's try/require fails and
  // returns false rather than crashing the server.
  const t = freshTracing({ OTEL_TRACES_ENABLED: "1" });
  assert.equal(t.tracing, false);
  assert.equal(t.sentry, false);
});

// Restore a clean env for any later test files in the same run.
test("cleanup env", () => {
  freshTracing();
});
