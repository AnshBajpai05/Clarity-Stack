// Structured logging + request correlation for Satellite (§10.5 observability).
//
// Mirrors the Backend's logging_setup.py so both services emit the SAME JSON shape
// ({ts, level, service, msg, request_id, ...}) and a single request can be stitched
// across services by its request_id. The id is read from the inbound X-Request-ID
// header (so it CHAINS from the Backend that called us) or minted if absent, echoed
// back on the response, and held in an AsyncLocalStorage so any `slog.*` call made
// while handling the request is stamped with it automatically — the Node equivalent
// of the Backend's ContextVar.
//
// Set LOG_JSON=false for human-readable text in local dev; JSON is the default.
const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");

const REQUEST_ID_HEADER = "X-Request-ID";
const SERVICE = "clarity-satellite";

const als = new AsyncLocalStorage();

function getRequestId() {
  const store = als.getStore();
  return (store && store.requestId) || "-";
}

function useJson() {
  const v = String(process.env.LOG_JSON ?? "true").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(v);
}

// Pure: build the log record. Exported so tests can assert the shape without spying
// on stdout.
function buildRecord(level, msg, fields = {}, requestId = getRequestId()) {
  return {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    msg,
    request_id: requestId,
    ...fields,
  };
}

function emit(level, msg, fields) {
  const rec = buildRecord(level, msg, fields);
  if (useJson()) {
    process.stdout.write(JSON.stringify(rec) + "\n");
  } else {
    const extra = Object.keys(fields || {}).length ? " " + JSON.stringify(fields) : "";
    process.stdout.write(`${rec.ts} [${level}] ${SERVICE} [rid=${rec.request_id}] ${msg}${extra}\n`);
  }
}

const slog = {
  info: (msg, fields) => emit("INFO", msg, fields),
  warn: (msg, fields) => emit("WARN", msg, fields),
  error: (msg, fields) => emit("ERROR", msg, fields),
};

// Express middleware: establish the correlation id for the request and log one
// structured access line per request (on response finish, so status + duration are real).
function requestLogger() {
  return (req, res, next) => {
    const rid = req.get(REQUEST_ID_HEADER) || crypto.randomUUID();
    req.requestId = rid;
    res.set(REQUEST_ID_HEADER, rid);

    const start = process.hrtime.bigint();
    als.run({ requestId: rid }, () => {
      res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        emit("INFO", "request", {
          method: req.method,
          path: req.originalUrl || req.url,
          status: res.statusCode,
          duration_ms: Math.round(durationMs * 100) / 100,
        });
      });
      next();
    });
  };
}

module.exports = { requestLogger, slog, getRequestId, buildRecord, REQUEST_ID_HEADER };
