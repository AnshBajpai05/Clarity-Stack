"""§5.7 — OpenTelemetry/Sentry init must be OPTIONAL and no-op unless switched on.

These tests assert the *contract* (gating + safe no-op), not the SDKs: the heavy OTel
packages aren't a base dependency, so with no env set every entrypoint here returns
cleanly without importing them. This is what keeps `pip install -r requirements_backend.txt`
and CI free of the observability extras.
"""
import importlib

import tracing


def _fresh(monkeypatch, **env):
    """Reload the module with a clean OTEL_/SENTRY_ env to read gating fresh."""
    for k in ("OTEL_TRACES_ENABLED", "OTEL_EXPORTER_OTLP_ENDPOINT", "SENTRY_DSN"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return importlib.reload(tracing)


def test_disabled_by_default_is_noop(monkeypatch):
    t = _fresh(monkeypatch)
    status = t.init_observability(app=object())  # app untouched on the disabled path
    assert status == {"tracing": False, "sentry": False}


def test_traces_gating(monkeypatch):
    assert _fresh(monkeypatch)._traces_enabled() is False
    assert _fresh(monkeypatch, OTEL_TRACES_ENABLED="1")._traces_enabled() is True
    # Configuring an endpoint alone implies enabled.
    assert _fresh(monkeypatch, OTEL_EXPORTER_OTLP_ENDPOINT="http://x:4317")._traces_enabled() is True


def test_sentry_requires_dsn(monkeypatch):
    assert _fresh(monkeypatch)._init_sentry() is False


def test_set_request_context_never_raises(monkeypatch):
    # No-op and exception-safe whether or not Sentry is initialised.
    _fresh(monkeypatch).set_sentry_request_context("abc123")


def test_truthy_parsing(monkeypatch):
    t = _fresh(monkeypatch, FOO="on")
    assert t._truthy("FOO") is True
    monkeypatch.setenv("FOO", "off")
    assert t._truthy("FOO") is False
    assert t._truthy("MISSING") is False
