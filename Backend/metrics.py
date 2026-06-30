"""Prometheus metrics in the exposition text format (§10.5 observability).

Dependency-free on purpose: a tiny thread-safe registry for HTTP request counters +
a latency histogram, rendered together with the LLM gateway's existing token/call
accounting (`llm_gateway._stats`, the single source of truth — we never re-count
tokens here). Exposed at GET /metrics for a Prometheus scraper.

Cost is emitted ONLY when a price map is configured (env LLM_PRICE_PER_1K_TOKENS,
JSON {provider: usd_per_1k_tokens}); otherwise it is omitted, never fabricated —
the same discipline the eval harness uses for cost.
"""
from __future__ import annotations

import json
import os
import threading
from typing import Dict, List, Tuple

# Standard Prometheus latency buckets (seconds). A request of duration d increments
# every bucket whose upper bound `le` >= d, so each stored count is already cumulative.
_BUCKETS: Tuple[float, ...] = (
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
)


class _HttpMetrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.req_total: Dict[Tuple[str, str, str], int] = {}     # (method, route, status) -> n
        self.exceptions_total: Dict[Tuple[str, str], int] = {}    # (method, route) -> n
        self._buckets: Dict[Tuple[str, str], List[int]] = {}      # (method, route) -> cumulative
        self._sum: Dict[Tuple[str, str], float] = {}
        self._count: Dict[Tuple[str, str], int] = {}

    def observe_request(self, method: str, route: str, status: int, duration_s: float) -> None:
        with self._lock:
            self.req_total[(method, route, str(status))] = \
                self.req_total.get((method, route, str(status)), 0) + 1
            dk = (method, route)
            b = self._buckets.setdefault(dk, [0] * len(_BUCKETS))
            for i, le in enumerate(_BUCKETS):
                if duration_s <= le:
                    b[i] += 1
            self._sum[dk] = self._sum.get(dk, 0.0) + duration_s
            self._count[dk] = self._count.get(dk, 0) + 1

    def record_exception(self, method: str, route: str) -> None:
        with self._lock:
            self.exceptions_total[(method, route)] = \
                self.exceptions_total.get((method, route), 0) + 1

    def reset(self) -> None:  # tests
        with self._lock:
            self.req_total.clear()
            self.exceptions_total.clear()
            self._buckets.clear()
            self._sum.clear()
            self._count.clear()


http = _HttpMetrics()


def _esc(v: str) -> str:
    """Escape a Prometheus label value (backslash, quote, newline)."""
    return str(v).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _labels(**kv: str) -> str:
    inner = ",".join(f'{k}="{_esc(v)}"' for k, v in kv.items())
    return "{" + inner + "}" if inner else ""


def _price_map() -> Dict[str, float]:
    raw = os.getenv("LLM_PRICE_PER_1K_TOKENS", "").strip()
    if not raw:
        return {}
    try:
        m = json.loads(raw)
        return {str(k): float(v) for k, v in m.items()}
    except Exception:
        return {}


def render() -> str:
    """Render the full /metrics body in Prometheus text exposition format (v0.0.4)."""
    out: List[str] = []

    # ---- HTTP request counter ----
    with http._lock:
        req_total = dict(http.req_total)
        exc_total = dict(http.exceptions_total)
        buckets = {k: list(v) for k, v in http._buckets.items()}
        dsum = dict(http._sum)
        dcount = dict(http._count)

    out.append("# HELP clarity_http_requests_total Total HTTP requests by method, route, status.")
    out.append("# TYPE clarity_http_requests_total counter")
    for (method, route, status), n in sorted(req_total.items()):
        out.append(f"clarity_http_requests_total{_labels(method=method, route=route, status=status)} {n}")

    out.append("# HELP clarity_http_exceptions_total Unhandled exceptions raised while serving a request.")
    out.append("# TYPE clarity_http_exceptions_total counter")
    for (method, route), n in sorted(exc_total.items()):
        out.append(f"clarity_http_exceptions_total{_labels(method=method, route=route)} {n}")

    # ---- HTTP latency histogram ----
    out.append("# HELP clarity_http_request_duration_seconds Request latency in seconds.")
    out.append("# TYPE clarity_http_request_duration_seconds histogram")
    for (method, route) in sorted(buckets):
        b = buckets[(method, route)]
        for i, le in enumerate(_BUCKETS):
            out.append(
                "clarity_http_request_duration_seconds_bucket"
                f"{_labels(method=method, route=route, le=str(le))} {b[i]}"
            )
        total = dcount.get((method, route), 0)
        out.append(
            "clarity_http_request_duration_seconds_bucket"
            f"{_labels(method=method, route=route, le='+Inf')} {total}"
        )
        out.append(
            "clarity_http_request_duration_seconds_sum"
            f"{_labels(method=method, route=route)} {dsum.get((method, route), 0.0)}"
        )
        out.append(
            "clarity_http_request_duration_seconds_count"
            f"{_labels(method=method, route=route)} {total}"
        )

    # ---- LLM gateway (read its accounting; never re-count) ----
    snap = None
    try:
        import llm_gateway
        snap = llm_gateway._stats.snapshot()
    except Exception:
        snap = None

    if snap is not None:
        out.append("# HELP clarity_llm_calls_total LLM calls made through the gateway.")
        out.append("# TYPE clarity_llm_calls_total counter")
        out.append(f"clarity_llm_calls_total {snap.get('calls', 0)}")

        out.append("# HELP clarity_llm_cache_hits_total Gateway cache hits (calls avoided).")
        out.append("# TYPE clarity_llm_cache_hits_total counter")
        out.append(f"clarity_llm_cache_hits_total {snap.get('cache_hits', 0)}")

        out.append("# HELP clarity_llm_errors_total LLM call failures across all providers.")
        out.append("# TYPE clarity_llm_errors_total counter")
        out.append(f"clarity_llm_errors_total {snap.get('errors', 0)}")

        out.append("# HELP clarity_llm_tokens_total Tokens consumed, by provider and kind.")
        out.append("# TYPE clarity_llm_tokens_total counter")
        prices = _price_map()
        cost_lines: List[str] = []
        for provider, pv in sorted(snap.get("by_provider", {}).items()):
            pt = pv.get("prompt_tokens", 0)
            ct = pv.get("completion_tokens", 0)
            out.append(f"clarity_llm_tokens_total{_labels(provider=provider, kind='prompt')} {pt}")
            out.append(f"clarity_llm_tokens_total{_labels(provider=provider, kind='completion')} {ct}")
            out.append(f"clarity_llm_calls_by_provider_total{_labels(provider=provider)} {pv.get('calls', 0)}")
            out.append(f"clarity_llm_failures_total{_labels(provider=provider)} {pv.get('failures', 0)}")
            if provider in prices:
                cost = (pt + ct) / 1000.0 * prices[provider]
                cost_lines.append(f"clarity_llm_cost_usd_total{_labels(provider=provider)} {round(cost, 6)}")

        # Cost only when priced (honest: omitted otherwise, never fabricated).
        if cost_lines:
            out.append("# HELP clarity_llm_cost_usd_total Estimated USD cost (priced providers only).")
            out.append("# TYPE clarity_llm_cost_usd_total counter")
            out.extend(cost_lines)

    return "\n".join(out) + "\n"
