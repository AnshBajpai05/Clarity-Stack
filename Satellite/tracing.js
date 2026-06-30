// OpenTelemetry traces + Sentry errors for Satellite (§5.7 observability).
//
// Mirrors the Backend's tracing.py: both capabilities are OPTIONAL and no-op unless
// switched on by env, and the packages are loaded with try/require so a plain
// `npm install` (without the observability extras) boots unchanged.
//
// IMPORTANT: this file MUST be require()'d as the FIRST line of server.js, before
// express/http are loaded — OTel auto-instrumentation patches those modules at
// require-time, so it has to register first. When the Backend calls us it forwards a
// W3C `traceparent` header (its `requests`/`httpx` are instrumented), so the span we
// create here CONTINUES the Backend's trace: one request = one cross-service trace.
//
// Enable traces:  OTEL_TRACES_ENABLED=1  (or set OTEL_EXPORTER_OTLP_ENDPOINT)
// Endpoint:       OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
// Enable errors:  SENTRY_DSN=https://...
"use strict";

function truthy(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] || "").trim().toLowerCase());
}

function tracesEnabled() {
  return truthy("OTEL_TRACES_ENABLED") || !!String(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "").trim();
}

function initTracing() {
  if (!tracesEnabled()) return false;
  try {
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
    const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
    const { resourceFromAttributes } = require("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");

    const endpoint = String(process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317").trim();
    const service = String(process.env.OTEL_SERVICE_NAME || "clarity-satellite").trim();

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: service }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    process.once("SIGTERM", () => sdk.shutdown().catch(() => {}));
    console.log(`[otel] traces enabled → ${endpoint} (service=${service})`);
    return true;
  } catch (e) {
    console.warn(`[otel] disabled: ${e.message}`);
    return false;
  }
}

function initSentry() {
  const dsn = String(process.env.SENTRY_DSN || "").trim();
  if (!dsn) return false;
  try {
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment: String(process.env.CLARITY_ENV || process.env.NODE_ENV || "dev").trim(),
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0) || 0,
    });
    console.log("[sentry] error tracking enabled");
    return true;
  } catch (e) {
    console.warn(`[sentry] disabled: ${e.message}`);
    return false;
  }
}

// Self-initialise on require so the import order guarantee (above) is the only thing a
// caller must get right.
const tracing = initTracing();
const sentry = initSentry();

module.exports = { tracing, sentry };
