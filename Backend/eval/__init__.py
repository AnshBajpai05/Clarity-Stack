"""AI-evaluation harness (§ eval).

Two layers, one scorer:
- OFFLINE (default, CI-safe, no network): runs the real prune -> parse -> validate
  pipeline over a golden set of raw model outputs and scores the resulting IR against
  hand-labeled expected IR. This is a regression gate on the *extraction/validation
  logic* (everything §16/§17 touched) — it fails when parsing/pruning/validation
  silently degrades.
- ONLINE (opt-in, needs API keys): calls the live extraction ensemble per transcript
  and records accuracy + latency + cost. Never runs in CI.

The scorer is shared so offline and online report the same precision/recall/F1.
"""
from .scoring import score_ir, score_section, ir_micro_average  # noqa: F401
from .golden import GOLDEN, GoldenCase, CASES_BY_ID  # noqa: F401
