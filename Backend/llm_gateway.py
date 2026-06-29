"""
LLM Gateway (§5.1 / §10.2) — single server-side chokepoint for all model calls.

Every provider ClarityStack uses (Groq, NVIDIA NIM, and any future local vLLM/Ollama)
speaks the OpenAI-compatible `/chat/completions` schema, so one code path serves them
all. Routing every call through here buys, in one place, what was previously absent and
scattered across `providers.py` / `hfClient.js` / the browser:

  * response caching            — keyed on (provider, model, messages, temperature, seed);
                                   only temperature==0 calls are cached (deterministic-intent,
                                   the extraction/synthesis hot path).
  * retry + exponential backoff — on 429 / 5xx / timeout / connection errors.
  * per-provider circuit breaker— after N consecutive transient failures a provider is
                                   skipped for a cooldown, so one vendor outage fails fast
                                   instead of adding latency to every request.
  * ordered fallback chains     — chat() takes a list of candidates and tries each until one
                                   succeeds (e.g. synthesis: Groq -> NVIDIA).
  * token accounting + logging  — per-call structured log (provider, model, latency, tokens,
                                   cache hit, attempts) and process-wide counters.
  * optional budget cap         — refuse new calls once a token budget is exhausted.

v1 is IN-PROCESS: cache / breaker / counters live in memory and reset per worker. That is
the same posture as the rate limiter (§5.6) — correct for single-worker dev, and the seam
to move to Redis when scaling out (§10.9). No call-site API changes: `providers._generic_chat`
delegates here, so `ask_*` keep their signatures and main.py / synthesis_service are untouched.
"""

import os
import json
import time
import hashlib
import logging
import threading
import contextvars
from collections import OrderedDict
from typing import Callable, List, Optional

import requests


# =========================================================
# CONFIG (env-overridable; safe defaults for single-worker dev)
# =========================================================
def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        logging.warning("[llm_gateway] %s is not an int — using default %s", name, default)
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        logging.warning("[llm_gateway] %s is not a float — using default %s", name, default)
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


CACHE_ENABLED   = _bool("LLM_CACHE_ENABLED", True)
CACHE_TTL       = _int("LLM_CACHE_TTL", 3600)        # seconds
CACHE_MAXSIZE   = _int("LLM_CACHE_MAXSIZE", 512)     # entries (LRU)
MAX_RETRIES     = _int("LLM_MAX_RETRIES", 2)         # => up to 3 attempts per candidate
BACKOFF_BASE    = _float("LLM_BACKOFF_BASE", 0.5)    # seconds; attempt n waits base*2**n
BACKOFF_MAX     = _float("LLM_BACKOFF_MAX", 8.0)     # cap per sleep
BREAKER_THRESHOLD = _int("LLM_BREAKER_THRESHOLD", 5) # consecutive transient fails to open
BREAKER_COOLDOWN  = _float("LLM_BREAKER_COOLDOWN", 30.0)  # seconds open
BUDGET_TOKENS   = _int("LLM_BUDGET_TOKENS", 0)       # 0 == unlimited (process-wide)
TENANT_BUDGET_TOKENS = _int("LLM_TENANT_BUDGET_TOKENS", 0)  # 0 == unlimited (per tenant)


# =========================================================
# PER-REQUEST TENANT (§10.2 per-tenant budgets)
# =========================================================
# The budget is keyed on an opaque "tenant" string (a user email for browser-driven
# calls, a service name for server-to-server). It is set per request and propagates
# across `asyncio.to_thread` because that copies the contextvars Context — so the
# in-process extraction/synthesis calls inherit the caller's tenant with no signature
# changes. The network endpoint (/llm/chat) passes tenant explicitly instead.
# v1 ledger is in-memory per worker (same posture as cache/breaker); the Redis seam
# for TRULY cross-service/cross-worker budgets is §10.9.
DEFAULT_TENANT = "global"
_current_tenant: "contextvars.ContextVar[str]" = contextvars.ContextVar(
    "llm_gateway_tenant", default=DEFAULT_TENANT
)


def set_request_tenant(tenant: Optional[str]) -> None:
    """Tag the current execution context (request) with a budget tenant."""
    _current_tenant.set(tenant or DEFAULT_TENANT)


def current_tenant() -> str:
    return _current_tenant.get()


# =========================================================
# ERRORS
# =========================================================
class GatewayError(Exception):
    """Raised when every candidate provider failed (or budget exhausted)."""


class _RetryableError(Exception):
    """Transient failure (429 / 5xx / timeout / connection) — retry, then trip breaker."""


class _FatalError(Exception):
    """Non-retryable failure for this request (4xx other than 429, bad payload).
    Skip to the next candidate but do NOT count toward the breaker (request-specific)."""


# =========================================================
# CANDIDATE
# =========================================================
class Candidate:
    """One provider/model endpoint to try, in order."""
    __slots__ = ("provider", "api_url", "api_key", "model")

    def __init__(self, provider: str, api_url: str, api_key: Optional[str], model: str):
        self.provider = provider
        self.api_url = api_url
        self.api_key = api_key
        self.model = model


# =========================================================
# TTL + LRU CACHE (thread-safe)
# =========================================================
class _Cache:
    def __init__(self, maxsize: int, ttl: float):
        self._maxsize = maxsize
        self._ttl = ttl
        self._store: "OrderedDict[str, tuple]" = OrderedDict()  # key -> (expires_at, value)
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[str]:
        now = time.monotonic()
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at < now:
                self._store.pop(key, None)
                return None
            self._store.move_to_end(key)   # LRU touch
            return value

    def set(self, key: str, value: str) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + self._ttl, value)
            self._store.move_to_end(key)
            while len(self._store) > self._maxsize:
                self._store.popitem(last=False)  # evict oldest

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


_cache = _Cache(CACHE_MAXSIZE, CACHE_TTL)


def _cache_key(provider: str, model: str, messages: list, temperature: float, seed,
               max_tokens=None, response_format=None) -> str:
    # response_format/max_tokens are part of the key: the SAME prompt asked for JSON
    # vs free text (or with a different cap) is a different result and must not collide.
    blob = json.dumps(
        {"p": provider, "m": model, "msgs": messages, "t": temperature, "s": seed,
         "mt": max_tokens, "rf": response_format},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# =========================================================
# CIRCUIT BREAKER (per provider)
# =========================================================
class _Breaker:
    def __init__(self, threshold: int, cooldown: float):
        self._threshold = threshold
        self._cooldown = cooldown
        self._fails = {}        # provider -> consecutive failure count
        self._open_until = {}   # provider -> monotonic time the circuit reopens
        self._lock = threading.Lock()

    def allow(self, provider: str) -> bool:
        with self._lock:
            until = self._open_until.get(provider, 0.0)
            return time.monotonic() >= until

    def record_success(self, provider: str) -> None:
        with self._lock:
            self._fails[provider] = 0
            self._open_until.pop(provider, None)

    def record_failure(self, provider: str) -> None:
        with self._lock:
            n = self._fails.get(provider, 0) + 1
            self._fails[provider] = n
            if n >= self._threshold:
                self._open_until[provider] = time.monotonic() + self._cooldown
                logging.warning(
                    "[llm_gateway] circuit OPEN for %s after %d consecutive failures "
                    "(cooldown %.0fs)", provider, n, self._cooldown,
                )


_breaker = _Breaker(BREAKER_THRESHOLD, BREAKER_COOLDOWN)


# =========================================================
# STATS / TOKEN ACCOUNTING (process-wide)
# =========================================================
class _Stats:
    def __init__(self):
        self._lock = threading.Lock()
        self.calls = 0
        self.cache_hits = 0
        self.errors = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.by_provider = {}   # provider -> {calls, prompt_tokens, completion_tokens, failures}
        self.by_tenant = {}     # tenant   -> {calls, prompt_tokens, completion_tokens}

    def _prov(self, provider: str) -> dict:
        return self.by_provider.setdefault(
            provider, {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "failures": 0}
        )

    def _tenant(self, tenant: str) -> dict:
        return self.by_tenant.setdefault(
            tenant, {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0}
        )

    def record_call(self, provider: str, usage: dict, tenant: str = DEFAULT_TENANT) -> None:
        pt = int((usage or {}).get("prompt_tokens", 0) or 0)
        ct = int((usage or {}).get("completion_tokens", 0) or 0)
        with self._lock:
            self.calls += 1
            self.prompt_tokens += pt
            self.completion_tokens += ct
            p = self._prov(provider)
            p["calls"] += 1
            p["prompt_tokens"] += pt
            p["completion_tokens"] += ct
            t = self._tenant(tenant)
            t["calls"] += 1
            t["prompt_tokens"] += pt
            t["completion_tokens"] += ct

    def tenant_tokens(self, tenant: str) -> int:
        with self._lock:
            t = self.by_tenant.get(tenant)
            return (t["prompt_tokens"] + t["completion_tokens"]) if t else 0

    def record_cache_hit(self) -> None:
        with self._lock:
            self.cache_hits += 1

    def record_failure(self, provider: str) -> None:
        with self._lock:
            self.errors += 1
            self._prov(provider)["failures"] += 1

    def total_tokens(self) -> int:
        with self._lock:
            return self.prompt_tokens + self.completion_tokens

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "calls": self.calls,
                "cache_hits": self.cache_hits,
                "errors": self.errors,
                "prompt_tokens": self.prompt_tokens,
                "completion_tokens": self.completion_tokens,
                "total_tokens": self.prompt_tokens + self.completion_tokens,
                "budget_tokens": BUDGET_TOKENS,
                "tenant_budget_tokens": TENANT_BUDGET_TOKENS,
                "by_provider": {k: dict(v) for k, v in self.by_provider.items()},
                "by_tenant": {k: dict(v) for k, v in self.by_tenant.items()},
            }


_stats = _Stats()


# =========================================================
# TRANSPORT (pluggable so logic is testable without network)
# =========================================================
def _requests_transport(api_url: str, headers: dict, payload: dict, timeout: int) -> dict:
    """Perform the HTTP call. Returns parsed JSON `data`. Classifies failures into
    _RetryableError (transient) / _FatalError (request-specific)."""
    try:
        resp = requests.post(api_url, headers=headers, json=payload, timeout=timeout)
    except requests.exceptions.Timeout as e:
        raise _RetryableError("timeout") from e
    except requests.exceptions.ConnectionError as e:
        raise _RetryableError("connection error") from e
    except requests.exceptions.RequestException as e:
        raise _RetryableError(f"request error: {e}") from e

    status = resp.status_code
    if status == 429 or status >= 500:
        # Don't echo the upstream body to callers (§9.3); log it server-side.
        logging.warning("[llm_gateway] transient HTTP %s on %s: %s", status, api_url, resp.text[:500])
        raise _RetryableError(f"HTTP {status}")
    if status >= 400:
        logging.error("[llm_gateway] fatal HTTP %s on %s: %s", status, api_url, resp.text[:500])
        raise _FatalError(f"HTTP {status}")

    try:
        data = resp.json()
    except ValueError as e:
        raise _FatalError("non-JSON response") from e
    if "choices" not in data:
        logging.error("[llm_gateway] unexpected payload on %s: %s", api_url, str(data)[:500])
        raise _FatalError("unexpected response shape")
    return data


# Module-global so tests can inject a fake transport via set_transport().
_transport: Callable[[str, dict, dict, int], dict] = _requests_transport


def set_transport(fn: Callable[[str, dict, dict, int], dict]) -> None:
    """Override the HTTP transport (used by tests). Pass None to restore default."""
    global _transport
    _transport = fn or _requests_transport


def _sleep_backoff(attempt: int) -> None:
    delay = min(BACKOFF_BASE * (2 ** attempt), BACKOFF_MAX)
    time.sleep(delay)


# =========================================================
# CORE: chat() with cache -> budget -> fallback -> retry/backoff -> breaker
# =========================================================
def chat(
    candidates: List[Candidate],
    system_prompt: str = "",
    user_prompt: str = "",
    temperature: float = 0.0,
    timeout: int = 60,
    seed: Optional[int] = None,
    tags: Optional[str] = None,
    tenant: Optional[str] = None,
    messages: Optional[list] = None,
    max_tokens: Optional[int] = None,
    response_format: Optional[dict] = None,
) -> str:
    """Run an OpenAI-compatible chat completion through the gateway.

    Tries `candidates` in order until one returns content. Returns the assistant text.
    Raises GatewayError if every candidate fails (or a token budget is exhausted).

    `tenant` keys the per-tenant budget/accounting (§10.2). When None it falls back to
    the per-request ContextVar (set via set_request_tenant), then to DEFAULT_TENANT.
    """
    if not candidates:
        raise GatewayError("no candidates supplied")

    tenant = tenant or current_tenant()

    # Callers may pass a full OpenAI-style `messages` list (Node/UML multi-turn) or
    # the simple system+user pair (providers.py). Either way the gateway treats it
    # uniformly from here, so cache/breaker/budget cover every call path.
    if messages is None:
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    cacheable = CACHE_ENABLED and temperature == 0.0

    # ---- cache lookup (keyed on the first candidate's provider/model) ----
    if cacheable:
        first = candidates[0]
        ckey = _cache_key(first.provider, first.model, messages, temperature, seed,
                          max_tokens, response_format)
        cached = _cache.get(ckey)
        if cached is not None:
            _stats.record_cache_hit()
            logging.info("[llm_gateway] cache HIT (%s/%s)%s",
                         first.provider, first.model, f" tags={tags}" if tags else "")
            return cached
    else:
        ckey = None

    # ---- budget gates (process-wide, then per-tenant) ----
    if BUDGET_TOKENS > 0 and _stats.total_tokens() >= BUDGET_TOKENS:
        logging.error("[llm_gateway] token budget exhausted (%d) — refusing call", BUDGET_TOKENS)
        raise GatewayError("token budget exhausted")
    if TENANT_BUDGET_TOKENS > 0 and _stats.tenant_tokens(tenant) >= TENANT_BUDGET_TOKENS:
        logging.error("[llm_gateway] tenant budget exhausted for %r (%d) — refusing call",
                      tenant, TENANT_BUDGET_TOKENS)
        raise GatewayError(f"tenant budget exhausted for {tenant}")

    last_reason = "all candidates failed"

    for cand in candidates:
        if not _breaker.allow(cand.provider):
            logging.info("[llm_gateway] skip %s — circuit open", cand.provider)
            last_reason = f"{cand.provider} circuit open"
            continue
        if not cand.api_key:
            logging.warning("[llm_gateway] skip %s — no API key configured", cand.provider)
            last_reason = f"{cand.provider} missing key"
            continue

        headers = {
            "Authorization": f"Bearer {cand.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": cand.model, "messages": messages, "temperature": temperature}
        if seed is not None:
            payload["seed"] = seed
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        if response_format is not None:
            payload["response_format"] = response_format

        for attempt in range(MAX_RETRIES + 1):
            started = time.monotonic()
            try:
                data = _transport(cand.api_url, headers, payload, timeout)
                content = data["choices"][0]["message"]["content"]
                usage = data.get("usage") or {}
                _breaker.record_success(cand.provider)
                _stats.record_call(cand.provider, usage, tenant)
                if cacheable and ckey is not None:
                    _cache.set(ckey, content)
                logging.info(
                    "[llm_gateway] %s/%s ok in %.2fs attempt=%d tokens=%s%s",
                    cand.provider, cand.model, time.monotonic() - started, attempt + 1,
                    (usage.get("total_tokens") if usage else "?"),
                    f" tags={tags}" if tags else "",
                )
                return content

            except _RetryableError as e:
                if attempt < MAX_RETRIES:
                    logging.warning(
                        "[llm_gateway] %s transient (%s) attempt %d/%d — backing off",
                        cand.provider, e, attempt + 1, MAX_RETRIES + 1,
                    )
                    _sleep_backoff(attempt)
                    continue
                # retries exhausted — count toward breaker, move to next candidate
                _breaker.record_failure(cand.provider)
                _stats.record_failure(cand.provider)
                last_reason = f"{cand.provider}: {e}"
                break

            except _FatalError as e:
                # request-specific (e.g. 400/401) — next candidate, do NOT trip breaker
                _stats.record_failure(cand.provider)
                last_reason = f"{cand.provider}: {e}"
                break

    raise GatewayError(last_reason)


# =========================================================
# INTROSPECTION
# =========================================================
def get_stats() -> dict:
    """Process-wide call / token / cache counters (for /llm/stats, §10.5 observability)."""
    return _stats.snapshot()


def reset_state() -> None:
    """Clear cache + breaker + stats. For tests."""
    global _breaker, _stats
    _cache.clear()
    _breaker = _Breaker(BREAKER_THRESHOLD, BREAKER_COOLDOWN)
    _stats = _Stats()


def config_summary() -> dict:
    return {
        "cache_enabled": CACHE_ENABLED,
        "cache_ttl": CACHE_TTL,
        "cache_maxsize": CACHE_MAXSIZE,
        "max_retries": MAX_RETRIES,
        "breaker_threshold": BREAKER_THRESHOLD,
        "breaker_cooldown": BREAKER_COOLDOWN,
        "budget_tokens": BUDGET_TOKENS,
        "tenant_budget_tokens": TENANT_BUDGET_TOKENS,
    }


logging.info("[llm_gateway] config: %s", config_summary())
