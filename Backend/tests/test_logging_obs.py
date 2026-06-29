"""Unit tests for structured logging + correlation id (§10.5). Pure: no app/DB."""
import json
import logging

import pytest

from logging_setup import (
    JsonLogFormatter, set_request_id, request_id_var, new_request_id, get_request_id,
)


@pytest.fixture(autouse=True)
def _reset_rid():
    token = request_id_var.set("-")
    yield
    request_id_var.reset(token)


def _format(msg, level=logging.INFO, exc_info=None, **extra):
    rec = logging.LogRecord("test.logger", level, __file__, 10, msg, None, exc_info)
    for k, v in extra.items():
        setattr(rec, k, v)
    return json.loads(JsonLogFormatter().format(rec))


def test_emits_valid_json_with_core_fields():
    out = _format("hello")
    assert out["level"] == "INFO"
    assert out["logger"] == "test.logger"
    assert out["msg"] == "hello"
    assert out["request_id"] == "-"
    assert "ts" in out and out["ts"].endswith("Z")


def test_request_id_from_contextvar():
    set_request_id("corr-123")
    assert get_request_id() == "corr-123"
    out = _format("x")
    assert out["request_id"] == "corr-123"


def test_structured_extra_fields_surface():
    out = _format("request", method="POST", path="/chats/x/ask", status=200, duration_ms=12.5)
    assert out["method"] == "POST"
    assert out["path"] == "/chats/x/ask"
    assert out["status"] == 200
    assert out["duration_ms"] == 12.5


def test_exception_is_captured():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys
        out = _format("request_error", level=logging.ERROR, exc_info=sys.exc_info())
    assert "exc" in out
    assert "ValueError: boom" in out["exc"]


def test_new_request_id_is_unique():
    assert new_request_id() != new_request_id()


def test_set_request_id_defaults_when_none():
    set_request_id(None)
    assert get_request_id() != "-"   # minted a fresh id
