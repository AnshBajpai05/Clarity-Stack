// §10.5 — structured logging + X-Request-ID correlation. Pure/in-process tests
// (no Mongo/network): drive the middleware with fake req/res and assert the
// correlation id is reused-or-minted, echoed, and that the record shape matches
// the Backend's JSON contract so logs join on request_id. Run: `node --test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  requestLogger, slog, getRequestId, buildRecord, REQUEST_ID_HEADER,
} = require("../middleware/requestLogger");

// Minimal Express-ish doubles. `get` reads a request header; `set` records a
// response header; `on("finish")` lets us fire the access-log line on demand.
function fakeReq(headers = {}, { method = "POST", url = "/api/satellite/internal/cleanup" } = {}) {
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { method, url, originalUrl: url, get: (h) => lower[h.toLowerCase()] };
}

function fakeRes() {
  const finish = [];
  return {
    statusCode: 200,
    headers: {},
    set(k, v) { this.headers[k] = v; },
    on(evt, cb) { if (evt === "finish") finish.push(cb); },
    emitFinish() { finish.forEach((cb) => cb()); },
  };
}

test("reuses an inbound X-Request-ID (chains across services)", () => {
  const req = fakeReq({ "X-Request-ID": "abc123" });
  const res = fakeRes();
  let seen;
  requestLogger()(req, res, () => { seen = getRequestId(); });
  assert.equal(req.requestId, "abc123");
  assert.equal(res.headers[REQUEST_ID_HEADER], "abc123");
  assert.equal(seen, "abc123", "the id is live in AsyncLocalStorage inside the handler");
});

test("mints a fresh id when none is supplied, and echoes it", () => {
  const req = fakeReq();
  const res = fakeRes();
  requestLogger()(req, res, () => {});
  assert.match(req.requestId, /[0-9a-f-]{36}/, "minted a UUID");
  assert.equal(res.headers[REQUEST_ID_HEADER], req.requestId);
});

test("each request gets its own id (no leakage between requests)", () => {
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const res = fakeRes();
    requestLogger()(fakeReq(), res, () => ids.push(getRequestId()));
  }
  assert.notEqual(ids[0], ids[1]);
});

test("outside any request the id is '-' (import/startup logs)", () => {
  assert.equal(getRequestId(), "-");
});

test("buildRecord matches the Backend JSON contract", () => {
  const rec = buildRecord("INFO", "request", { status: 200 }, "rid-1");
  assert.equal(rec.level, "INFO");
  assert.equal(rec.service, "clarity-satellite");
  assert.equal(rec.msg, "request");
  assert.equal(rec.request_id, "rid-1");
  assert.equal(rec.status, 200);
  // ts is ISO-8601 with a trailing Z, like the Backend formatter.
  assert.match(rec.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test("slog stamps the ambient request id from AsyncLocalStorage", () => {
  // Capture stdout for one structured line emitted inside a request context.
  const req = fakeReq({ "X-Request-ID": "trace-xyz" });
  const res = fakeRes();
  const written = [];
  const orig = process.stdout.write;
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    requestLogger()(req, res, () => slog.info("internal_cleanup", { scope: "chat" }));
  } finally {
    process.stdout.write = orig;
  }
  const line = written.find((l) => l.includes("internal_cleanup"));
  assert.ok(line, "a structured line was written");
  const parsed = JSON.parse(line);
  assert.equal(parsed.request_id, "trace-xyz");
  assert.equal(parsed.scope, "chat");
});
