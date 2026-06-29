"""
Structured logging + request correlation (§10.5 observability).

Two problems with the old `logging.basicConfig` text logs: (1) they aren't
machine-parseable, so you can't slice by tenant/route/status in a log pipeline, and
(2) there's no way to stitch the lines belonging to ONE request together — especially
once a request fans out across `asyncio.to_thread` and the LLM gateway.

This module fixes both:
  * `JsonLogFormatter` emits one JSON object per line (ts, level, logger, msg, …) plus
    any structured `extra=` fields a caller passes.
  * a per-request correlation id lives in a ContextVar (`request_id`) that the formatter
    stamps onto EVERY log line emitted during that request — including ones from
    threads, because `asyncio.to_thread` copies the contextvars Context. The id is read
    from the inbound `X-Request-ID` header (so it chains across services) or generated.
  * the active gateway `tenant` (§10.2) is folded in too, for free per-tenant log slicing.

Set `LOG_JSON=false` for human-readable text in local dev; JSON is the default.
"""
import os
import sys
import json
import time
import uuid
import logging
import contextvars
from typing import Optional

# Correlation id for the current request/execution context. "-" outside any request
# (e.g. import/startup logs).
request_id_var: "contextvars.ContextVar[str]" = contextvars.ContextVar("request_id", default="-")

# Standard LogRecord attributes we should NOT re-emit as "extra" structured fields.
_RESERVED = set(vars(logging.makeLogRecord({})).keys()) | {
    "message", "asctime", "taskName",
}


def new_request_id() -> str:
    return uuid.uuid4().hex


def set_request_id(rid: Optional[str]) -> "contextvars.Token":
    return request_id_var.set(rid or new_request_id())


def get_request_id() -> str:
    return request_id_var.get()


def _current_tenant() -> Optional[str]:
    # Best-effort: the gateway owns the tenant ContextVar; never let logging break if
    # it can't be imported.
    try:
        import llm_gateway
        return llm_gateway.current_tenant()
    except Exception:
        return None


class JsonLogFormatter(logging.Formatter):
    """Render a LogRecord as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
                  + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        tenant = _current_tenant()
        if tenant and tenant != "global":
            payload["tenant"] = tenant

        # Surface structured extras passed via logger.info(msg, extra={...}).
        for k, v in record.__dict__.items():
            if k not in _RESERVED and not k.startswith("_"):
                payload[k] = v

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    """Install the JSON (or plain) formatter on the root logger. Idempotent."""
    level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    use_json = os.getenv("LOG_JSON", "true").strip().lower() not in ("0", "false", "no", "off")

    handler = logging.StreamHandler(sys.stdout)
    if use_json:
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s [rid=%(request_id)s] %(message)s"
        ))
        # text mode needs request_id available as a record attribute
        logging.setLogRecordFactory(_text_record_factory(logging.getLogRecordFactory()))

    root = logging.getLogger()
    root.handlers[:] = [handler]   # replace basicConfig/uvicorn defaults
    root.setLevel(level)


def _text_record_factory(base):
    def factory(*args, **kwargs):
        record = base(*args, **kwargs)
        record.request_id = request_id_var.get()
        return record
    return factory
