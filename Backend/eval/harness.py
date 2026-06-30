"""Evaluation harness runner.

OFFLINE (default): score the prune -> parse pipeline over the golden set. Pure, fast,
no network — this is what CI gates on.

    python -m eval.harness

ONLINE (opt-in): profile the live extraction ensemble for latency (real) and cost
(only when a price map is supplied — otherwise reported as n/a, never fabricated).
Requires provider API keys in the environment; skips with a clear message if absent.

    python -m eval.harness --online
"""
from __future__ import annotations

import argparse
import os
import time
from typing import Dict, List, Optional

# Offline pipeline = the exact code path production uses, minus the DB/model.
from synthesis_service import prune_to_synthesis_ir
from ir_parser import parse_ir_from_synthesis

from .golden import GOLDEN, GoldenCase
from .scoring import score_ir, ir_micro_average


# ----------------------------- OFFLINE (accuracy) -----------------------------

def extract_offline(raw: str) -> Dict[str, List[str]]:
    """Run the real, deterministic extraction-cleaning pipeline (no model, no DB)."""
    return parse_ir_from_synthesis(prune_to_synthesis_ir(raw))


def run_offline(cases: List[GoldenCase] = GOLDEN, threshold: float = 0.4) -> Dict[str, object]:
    rows = []
    section_totals: Dict[str, Dict[str, float]] = {}
    for c in cases:
        predicted = extract_offline(c.raw)
        scored = score_ir(predicted, c.expected, threshold)
        rows.append({"id": c.id, "overall": scored["overall"], "per_section": scored["per_section"]})
        for sec, s in scored["per_section"].items():
            agg = section_totals.setdefault(sec, {"tp": 0, "fp": 0, "fn": 0})
            agg["tp"] += s["tp"]; agg["fp"] += s["fp"]; agg["fn"] += s["fn"]
    overall = ir_micro_average({sec: {**v, "precision": 0, "recall": 0, "f1": 0}
                                for sec, v in section_totals.items()})
    return {"rows": rows, "overall": overall, "section_totals": section_totals}


def format_offline_table(result: Dict[str, object]) -> str:
    lines = ["", "AI-EVAL — offline extraction quality (golden set)", "=" * 64,
             f"{'case':<32}{'P':>8}{'R':>8}{'F1':>8}"]
    for r in result["rows"]:
        o = r["overall"]
        lines.append(f"{r['id']:<32}{o['precision']:>8.2f}{o['recall']:>8.2f}{o['f1']:>8.2f}")
    o = result["overall"]
    lines += ["-" * 64,
              f"{'MICRO-AVG (all bullets)':<32}{o['precision']:>8.2f}{o['recall']:>8.2f}{o['f1']:>8.2f}",
              f"  tp={o['tp']}  fp={o['fp']}  fn={o['fn']}", ""]
    return "\n".join(lines)


# ------------------------- ONLINE (latency / cost) ----------------------------

# Representative extraction prompts. Latency/cost is measured live; accuracy is NOT
# claimed here — that needs labeled (transcript -> IR) pairs, which the golden set is
# deliberately not (it labels raw model output, not transcripts).
PROFILE_PROMPTS = [
    "We debated Postgres vs SQLite for the workspace store and chose Postgres for "
    "concurrent writers, accepting the extra ops cost.",
    "Should we adopt Kafka for the event bus? It decouples producers but adds heavy "
    "operational complexity the team has not run before.",
]


def _est_tokens(text: str) -> int:
    """Rough token estimate (~4 chars/token). Labeled an estimate; not billed truth."""
    return max(1, len(text or "") // 4)


def profile_online(
    prompts: List[str] = PROFILE_PROMPTS,
    price_per_1k_tokens: Optional[Dict[str, float]] = None,
) -> Dict[str, object]:
    """Call each ensemble member on each prompt; record real latency + token estimate.
    Cost is computed ONLY for models present in `price_per_1k_tokens`; otherwise n/a."""
    import providers  # imported lazily so offline/CI never needs provider config

    results = []
    for label, fn in providers.EXTRACTION_ENSEMBLE:
        lat, in_tok, out_tok, ok = [], 0, 0, 0
        for p in prompts:
            t0 = time.perf_counter()
            try:
                out = fn(p)
            except Exception:
                out = None
            dt = time.perf_counter() - t0
            if out:
                ok += 1
                lat.append(dt)
                in_tok += _est_tokens(p)
                out_tok += _est_tokens(out)
        mean_lat = sum(lat) / len(lat) if lat else None
        price = (price_per_1k_tokens or {}).get(label)
        cost = None if price is None else round((in_tok + out_tok) / 1000 * price, 5)
        results.append({"model": label, "ok": ok, "n": len(prompts),
                        "mean_latency_s": mean_lat, "est_tokens": in_tok + out_tok,
                        "cost_usd": cost})
    return {"models": results}


def format_online_table(result: Dict[str, object]) -> str:
    lines = ["", "AI-EVAL — online ensemble profile (latency real, cost est.)", "=" * 72,
             f"{'model':<40}{'ok/n':>8}{'lat(s)':>10}{'cost$':>10}"]
    for r in result["models"]:
        lat = "n/a" if r["mean_latency_s"] is None else f"{r['mean_latency_s']:.2f}"
        cost = "n/a" if r["cost_usd"] is None else f"{r['cost_usd']:.5f}"
        okn = f"{r['ok']}/{r['n']}"
        lines.append(f"{r['model']:<40}{okn:>8}{lat:>10}{cost:>10}")
    lines.append("")
    return "\n".join(lines)


def _has_provider_keys() -> bool:
    return any(os.getenv(k) for k in ("GROQ_API_KEY", "NVIDIA_API_KEY", "NGC_API_KEY"))


def main() -> None:
    ap = argparse.ArgumentParser(description="Clarity AI-evaluation harness")
    ap.add_argument("--online", action="store_true",
                    help="also profile the live ensemble (needs provider API keys)")
    args = ap.parse_args()

    offline = run_offline()
    print(format_offline_table(offline))

    if args.online:
        if not _has_provider_keys():
            print("[online] skipped — no provider API keys in environment.\n")
            return
        print(format_online_table(profile_online()))


if __name__ == "__main__":
    main()
