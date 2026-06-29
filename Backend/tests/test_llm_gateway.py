"""Tests for the LLM gateway's §10.2 additions: per-tenant budgets + the central
/llm/chat HTTP surface (auth, tenant derivation, SSRF guard, budget -> 402).

No network and no DB: the gateway transport is faked and the endpoint is mounted on
a throwaway FastAPI app so we never import main.py / run migrations.
"""
import pytest

import llm_gateway as gateway


def _fake_transport(tokens=10):
    """Transport stub: always succeeds, reports `tokens` completion tokens."""
    def _t(api_url, headers, payload, timeout):
        return {
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": tokens},
        }
    return _t


@pytest.fixture(autouse=True)
def _clean_gateway():
    gateway.reset_state()
    gateway.set_request_tenant(None)
    gateway.set_transport(_fake_transport())
    yield
    gateway.set_transport(None)
    gateway.reset_state()


def _cand():
    return [gateway.Candidate("groq", "https://x/groq", "key", "m")]


# ─────────────────────────── per-tenant budgets ───────────────────────────

def test_tenant_budget_isolates_tenants(monkeypatch):
    monkeypatch.setattr(gateway, "TENANT_BUDGET_TOKENS", 5)
    monkeypatch.setattr(gateway, "CACHE_ENABLED", False)  # cache hits are free -> exercise the gate
    gateway.set_transport(_fake_transport(tokens=10))

    # tenant "alice": first call ok (spends 10), second refused (10 >= 5 budget).
    assert gateway.chat(_cand(), user_prompt="hi", tenant="alice") == "ok"
    with pytest.raises(gateway.GatewayError) as e:
        gateway.chat(_cand(), user_prompt="hi", tenant="alice")
    assert "budget" in str(e.value)

    # tenant "bob" is unaffected by alice's spend.
    assert gateway.chat(_cand(), user_prompt="hi", tenant="bob") == "ok"


def test_tenant_defaults_to_contextvar(monkeypatch):
    gateway.set_request_tenant("ctx-user@example.com")
    gateway.chat(_cand(), user_prompt="hi")   # no explicit tenant
    stats = gateway.get_stats()
    assert "ctx-user@example.com" in stats["by_tenant"]
    assert stats["by_tenant"]["ctx-user@example.com"]["calls"] == 1


def test_zero_tenant_budget_is_unlimited(monkeypatch):
    monkeypatch.setattr(gateway, "TENANT_BUDGET_TOKENS", 0)
    for _ in range(5):
        assert gateway.chat(_cand(), user_prompt="hi", tenant="t") == "ok"


# ─────────────────────────── /llm/chat endpoint ───────────────────────────

def _client(monkeypatch, service_token="secret"):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import llm_gateway_api as api

    monkeypatch.setattr(api, "SERVICE_TOKEN", service_token)
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")  # so candidate has a key

    app = FastAPI()
    app.include_router(api.router)
    return TestClient(app, raise_server_exceptions=False)


def test_endpoint_service_token_ok(monkeypatch):
    client = _client(monkeypatch)
    r = client.post("/llm/chat",
                    headers={"X-Service-Token": "secret"},
                    json={"user_prompt": "hi", "provider": "groq", "model": "m",
                          "tenant": "proj-42"})
    assert r.status_code == 200
    body = r.json()
    assert body["content"] == "ok"
    assert body["tenant"] == "proj-42"     # service caller's tenant honored


def test_endpoint_rejects_unauthenticated(monkeypatch):
    client = _client(monkeypatch)
    r = client.post("/llm/chat",
                    json={"user_prompt": "hi", "provider": "groq", "model": "m"})
    assert r.status_code == 401             # no service token, no user JWT


def test_endpoint_rejects_unknown_provider_no_ssrf(monkeypatch):
    client = _client(monkeypatch)
    r = client.post("/llm/chat",
                    headers={"X-Service-Token": "secret"},
                    json={"user_prompt": "hi", "provider": "evil", "model": "m"})
    assert r.status_code == 400             # provider not in allow-list; no arbitrary URL


def test_endpoint_budget_exhaustion_returns_402(monkeypatch):
    monkeypatch.setattr(gateway, "TENANT_BUDGET_TOKENS", 5)
    monkeypatch.setattr(gateway, "CACHE_ENABLED", False)  # cache hits are free -> exercise the gate
    gateway.set_transport(_fake_transport(tokens=10))
    client = _client(monkeypatch)
    h = {"X-Service-Token": "secret"}
    j = {"user_prompt": "hi", "provider": "groq", "model": "m", "tenant": "t"}
    assert client.post("/llm/chat", headers=h, json=j).status_code == 200
    r = client.post("/llm/chat", headers=h, json=j)
    assert r.status_code == 402             # budget, distinct from 503 providers-down
