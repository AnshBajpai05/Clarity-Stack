"""§10.5 — Prometheus /metrics: HTTP counters + latency histogram + gateway token/cost.

Mostly pure (no DB/network): drives the registry directly and asserts the exposition
format. One TestClient test proves the endpoint is wired and self-observes requests.
"""
import os
import tempfile

# App import needs env set first (mirrors test_ask_endpoint).
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["DATABASE_URL"] = "sqlite:///" + _db_path.replace("\\", "/")
os.environ["RUN_MIGRATIONS_ON_STARTUP"] = "0"

import pytest
from fastapi.testclient import TestClient

import metrics


@pytest.fixture(autouse=True)
def _clean_http():
    metrics.http.reset()
    yield
    metrics.http.reset()


# ---- HTTP counters + histogram (pure) ----

def test_request_counter_increments_per_method_route_status():
    metrics.http.observe_request("GET", "/projects", 200, 0.01)
    metrics.http.observe_request("GET", "/projects", 200, 0.02)
    metrics.http.observe_request("GET", "/projects", 500, 0.2)
    body = metrics.render()
    assert 'clarity_http_requests_total{method="GET",route="/projects",status="200"} 2' in body
    assert 'clarity_http_requests_total{method="GET",route="/projects",status="500"} 1' in body


def test_histogram_buckets_are_cumulative_and_have_inf_plus_sum_count():
    # durations 0.02 and 0.2 -> the 0.025 bucket holds 1, the 0.25 bucket holds both.
    metrics.http.observe_request("POST", "/r", 200, 0.02)
    metrics.http.observe_request("POST", "/r", 200, 0.2)
    body = metrics.render()
    assert 'clarity_http_request_duration_seconds_bucket{method="POST",route="/r",le="0.025"} 1' in body
    assert 'clarity_http_request_duration_seconds_bucket{method="POST",route="/r",le="0.25"} 2' in body
    assert 'clarity_http_request_duration_seconds_bucket{method="POST",route="/r",le="+Inf"} 2' in body
    assert 'clarity_http_request_duration_seconds_count{method="POST",route="/r"} 2' in body
    assert 'clarity_http_request_duration_seconds_sum{method="POST",route="/r"}' in body


def test_exception_counter():
    metrics.http.record_exception("DELETE", "/chats/{chat_id}")
    body = metrics.render()
    assert 'clarity_http_exceptions_total{method="DELETE",route="/chats/{chat_id}"} 1' in body


def test_label_values_are_escaped():
    metrics.http.observe_request("GET", '/weird"\\path', 200, 0.01)
    body = metrics.render()
    assert r'route="/weird\"\\path"' in body


# ---- LLM gateway token/cost (reads the gateway's own accounting) ----

def test_tokens_rendered_from_gateway_snapshot():
    import llm_gateway
    llm_gateway._stats = llm_gateway._Stats()  # isolate
    llm_gateway._stats.record_call("groq", {"prompt_tokens": 100, "completion_tokens": 40}, "global")
    body = metrics.render()
    assert 'clarity_llm_tokens_total{provider="groq",kind="prompt"} 100' in body
    assert 'clarity_llm_tokens_total{provider="groq",kind="completion"} 40' in body
    assert "clarity_llm_calls_total 1" in body


def test_cost_only_emitted_when_priced(monkeypatch):
    import llm_gateway
    llm_gateway._stats = llm_gateway._Stats()
    llm_gateway._stats.record_call("groq", {"prompt_tokens": 1000, "completion_tokens": 0}, "global")

    monkeypatch.delenv("LLM_PRICE_PER_1K_TOKENS", raising=False)
    assert "clarity_llm_cost_usd_total" not in metrics.render()

    monkeypatch.setenv("LLM_PRICE_PER_1K_TOKENS", '{"groq": 0.05}')
    body = metrics.render()
    # 1000 tokens / 1000 * 0.05 = 0.05
    assert 'clarity_llm_cost_usd_total{provider="groq"} 0.05' in body


# ---- endpoint wiring ----

def test_metrics_endpoint_is_served_and_self_observes():
    import main
    client = TestClient(main.app)
    first = client.get("/metrics")
    assert first.status_code == 200
    assert first.headers["content-type"].startswith("text/plain")
    # the first scrape was recorded by the middleware, so the second shows it.
    body = client.get("/metrics").text
    assert 'clarity_http_requests_total{method="GET",route="/metrics",status="200"}' in body
