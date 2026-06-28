"""
Lightweight in-memory rate limiter (§5.6).

A sliding-window counter keyed on (scope, client-IP), exposed as a FastAPI
dependency so expensive/abusable routes (LLM calls, auth) can't be hammered for
financial-DoS or brute-force.

NOTE: state is per-process. Under multiple uvicorn workers each has its own
buckets, so the effective limit is (limit × workers). Move the store to Redis when
scaling beyond one process (pairs with the §10.9 queue/broker work).
"""

import time
from collections import defaultdict, deque

from fastapi import Request, HTTPException

_BUCKETS: dict[str, deque] = defaultdict(deque)


class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: int, scope: str = ""):
        self.max_calls = max_calls
        self.window = window_seconds
        self.scope = scope

    def __call__(self, request: Request):
        ip = request.client.host if request.client else "unknown"
        key = f"{self.scope or request.url.path}:{ip}"
        now = time.monotonic()
        dq = _BUCKETS[key]

        cutoff = now - self.window
        while dq and dq[0] <= cutoff:
            dq.popleft()

        if len(dq) >= self.max_calls:
            retry = int(self.window - (now - dq[0])) + 1
            raise HTTPException(
                status_code=429,
                detail="Too many requests — please slow down.",
                headers={"Retry-After": str(retry)},
            )

        dq.append(now)
