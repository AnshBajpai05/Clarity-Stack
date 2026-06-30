"""OpenTelemetry traces + Sentry error tracking (§5.7 / §10.5 observability).

Completes the observability leg that `metrics.py` (Prometheus) and `logging_setup.py`
(structured logs + request_id) started. Two capabilities, both **optional and no-op
unless turned on** — the same discipline as `metrics.py` ("dependency-free on purpose"):

  * **Traces** — when OTel is enabled (env, below) we instrument the FastAPI app and the
    outbound HTTP clients (`requests`, `httpx`) so one user action produces a single
    distributed trace spanning UI → Core → LLM gateway → provider, and the `traceparent`
    header is propagated to Satellite (which continues the same trace). Every server span
    is stamped with the request's `request_id`, so a log line and its span share one id.
  * **Errors** — when `SENTRY_DSN` is set we initialise Sentry; its logging integration
    captures the `logging.exception("request_error", ...)` the request middleware already
    emits, with the `request_id` attached as a tag.

If the packages aren't installed, or the env switches are off, every function here is a
silent no-op: imports never fail at module load, tests need no new deps, and a plain
`pip install -r requirements_backend.txt` (no observability extras) runs unchanged.

Enable traces:  OTEL_TRACES_ENABLED=1  (or just set OTEL_EXPORTER_OTLP_ENDPOINT)
Endpoint:       OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317  (default :4317)
Service name:   OTEL_SERVICE_NAME=clarity-backend
Enable errors:  SENTRY_DSN=https://...    SENTRY_TRACES_SAMPLE_RATE=0.0
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("observability")


def _truthy(name: str, default: str = "") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _traces_enabled() -> bool:
    # Explicit switch, or implied by configuring an endpoint.
    return _truthy("OTEL_TRACES_ENABLED") or bool(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip())


# --------------------------------------------------------------------------- traces

def _init_tracing(app) -> bool:
    """Wire OpenTelemetry to the FastAPI app + outbound HTTP. Returns True if enabled."""
    if not _traces_enabled():
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    except Exception as e:  # package(s) not installed — stay a no-op
        log.warning("otel_disabled", extra={"reason": f"import failed: {e}"})
        return False

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317").strip()
    service = os.getenv("OTEL_SERVICE_NAME", "clarity-backend").strip()
    env = os.getenv("CLARITY_ENV", os.getenv("ENV", "dev")).strip()

    resource = Resource.create({"service.name": service, "deployment.environment": env})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(_RequestIdSpanProcessor())
    # OTLP exporter is insecure (plaintext) by default for the in-cluster collector.
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True)))
    trace.set_tracer_provider(provider)

    # Server spans for every request.
    FastAPIInstrumentor.instrument_app(app)
    # Client spans + W3C traceparent propagation to Satellite / providers.
    _instrument_http_clients()

    log.info("otel_enabled", extra={"endpoint": endpoint, "service": service})
    return True


def _instrument_http_clients() -> None:
    """Instrument the outbound HTTP libraries this codebase uses, each best-effort."""
    try:
        from opentelemetry.instrumentation.requests import RequestsInstrumentor
        RequestsInstrumentor().instrument()
    except Exception:
        pass
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        HTTPXClientInstrumentor().instrument()
    except Exception:
        pass


def _RequestIdSpanProcessor():  # noqa: N802 — factory keeps SDK import lazy
    """A SpanProcessor that copies the per-request `request_id` onto each span, so a
    trace and the JSON log lines for the same request join on one id."""
    from opentelemetry.sdk.trace import SpanProcessor

    class _Proc(SpanProcessor):
        def on_start(self, span, parent_context=None):
            try:
                from logging_setup import request_id_var
                rid = request_id_var.get()
                if rid and rid != "-":
                    span.set_attribute("request_id", rid)
            except Exception:
                pass

        def on_end(self, span):
            pass

        def shutdown(self):
            pass

        def force_flush(self, timeout_millis: int = 30000):
            return True

    return _Proc()


# --------------------------------------------------------------------------- errors

def _init_sentry() -> bool:
    """Initialise Sentry if SENTRY_DSN is set and the SDK is installed. Returns enabled."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
    except Exception as e:
        log.warning("sentry_disabled", extra={"reason": f"import failed: {e}"})
        return False

    env = os.getenv("CLARITY_ENV", os.getenv("ENV", "dev")).strip()
    try:
        sample = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0") or 0)
    except ValueError:
        sample = 0.0

    sentry_sdk.init(
        dsn=dsn,
        environment=env,
        traces_sample_rate=sample,
        # Capture ERROR logs as events; INFO+ as breadcrumbs. The request middleware
        # already calls logging.exception("request_error", ...) — that becomes an event.
        integrations=[LoggingIntegration(level=logging.INFO, event_level=logging.ERROR)],
    )
    log.info("sentry_enabled", extra={"environment": env})
    return True


def set_sentry_request_context(request_id: str) -> None:
    """Tag the current Sentry scope with the request_id (best-effort, no-op if off)."""
    try:
        import sentry_sdk
        sentry_sdk.set_tag("request_id", request_id)
    except Exception:
        pass


# --------------------------------------------------------------------------- entry

def init_observability(app) -> dict:
    """Initialise traces + errors. Safe to call once at startup; returns what's on."""
    return {
        "tracing": _init_tracing(app),
        "sentry": _init_sentry(),
    }
