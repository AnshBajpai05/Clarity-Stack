"""
LLM Gateway HTTP surface (§10.2) — the central network chokepoint.

Exposes the in-process `llm_gateway` over HTTP so the OTHER runtimes (Node Satellite,
the UML `/api/llm` proxy) route their model calls through the SAME cache / circuit
breaker / token budget / stats instead of each hitting vendors directly with its own
bespoke retry logic. v1 shares state within one Backend worker; Redis for
cross-worker / cross-service state is §10.9.

Security posture:
  * Provider API keys live ONLY on this server. Callers send a provider NAME + model,
    never a URL or key — so a caller cannot make us POST to an arbitrary host (SSRF)
    or exfiltrate keys.
  * Auth accepts EITHER a trusted server (header `X-Service-Token` == the configured
    GATEWAY_SERVICE_TOKEN) OR a normal authenticated user (access JWT).
  * Per-tenant budget key (§10.2): user-JWT callers are ALWAYS billed to their own
    email (a body `tenant` is ignored — no spoofing someone else's budget). Trusted
    service callers MAY pass a `tenant` (the end-user/project they act for); absent
    that they bill to the service bucket.
"""
import os
import secrets
import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

import llm_gateway as gateway
from auth import get_current_user

router = APIRouter(prefix="/llm", tags=["llm-gateway"])

# Set in any non-dev environment. If unset, the service-token path is disabled and
# only authenticated users can reach the gateway (fail-closed, not fail-open).
SERVICE_TOKEN = os.getenv("GATEWAY_SERVICE_TOKEN")
SERVICE_TENANT_DEFAULT = "service"

# provider name -> (endpoint URL, env var holding the key). The single place that
# maps a logical provider to where we actually call + which key we use. Adding a
# provider (e.g. a local vLLM, §10.11) is one line here.
PROVIDER_ENDPOINTS = {
    "groq":   ("https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY"),
    "nvidia": ("https://integrate.api.nvidia.com/v1/chat/completions", "NVIDIA_API_KEY"),
    "hf":     ("https://router.huggingface.co/v1/chat/completions", "HF_TOKEN"),
}


class WireCandidate(BaseModel):
    provider: str            # must be a key of PROVIDER_ENDPOINTS
    model: str
    # NB: no api_url / api_key fields — both are resolved server-side (anti-SSRF).


class ChatRequest(BaseModel):
    # Either a full OpenAI-style messages list, or system+user.
    messages: Optional[List[dict]] = None
    system_prompt: str = ""
    user_prompt: str = ""
    # Ordered fallback chain. If omitted, `provider`+`model` shorthand is used.
    candidates: Optional[List[WireCandidate]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: float = 0.0
    timeout: int = 60
    seed: Optional[int] = None
    tags: Optional[str] = None
    tenant: Optional[str] = None     # honored for service callers only
    max_tokens: Optional[int] = None
    response_format: Optional[dict] = None


def _resolve_caller(request: Request, body: ChatRequest) -> str:
    """Authenticate the caller and return the budget tenant. Raises 401 otherwise."""
    svc = request.headers.get("X-Service-Token")
    if SERVICE_TOKEN and svc and secrets.compare_digest(svc, SERVICE_TOKEN):
        return (body.tenant or "").strip() or SERVICE_TENANT_DEFAULT
    # Not a trusted service → must be an authenticated user; bill to their email.
    user = get_current_user(request)   # raises HTTPException(401) if not authenticated
    return user["email"]


def _build_candidates(body: ChatRequest) -> List[gateway.Candidate]:
    wire = body.candidates or (
        [WireCandidate(provider=body.provider, model=body.model)]
        if body.provider and body.model else []
    )
    if not wire:
        raise HTTPException(status_code=400,
                            detail="provide `candidates` or `provider`+`model`")

    out: List[gateway.Candidate] = []
    for c in wire:
        endpoint = PROVIDER_ENDPOINTS.get(c.provider)
        if not endpoint:
            raise HTTPException(status_code=400, detail=f"unknown provider '{c.provider}'")
        url, key_env = endpoint
        out.append(gateway.Candidate(c.provider, url, os.getenv(key_env), c.model))
    return out


@router.post("/chat")
async def llm_chat(req: ChatRequest, request: Request) -> dict[str, Any]:
    """Central, audited chat completion for every runtime. Returns assistant text."""
    tenant = _resolve_caller(request, req)
    candidates = _build_candidates(req)

    try:
        content = gateway.chat(
            candidates=candidates,
            system_prompt=req.system_prompt,
            user_prompt=req.user_prompt,
            messages=req.messages,
            temperature=req.temperature,
            timeout=req.timeout,
            seed=req.seed,
            tags=req.tags,
            tenant=tenant,
            max_tokens=req.max_tokens,
            response_format=req.response_format,
        )
    except gateway.GatewayError as e:
        # Budget exhaustion / all candidates failed. 402 for budget so callers can
        # distinguish "out of quota" from "providers down" (503).
        msg = str(e)
        status = 402 if "budget" in msg else 503
        logging.warning("[llm_gateway_api] chat failed for tenant=%s: %s", tenant, msg)
        raise HTTPException(status_code=status, detail=msg)

    return {"content": content, "tenant": tenant}
