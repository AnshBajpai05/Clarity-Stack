"""Experiment tracking for the eval harness (§10.10).

Persists each scored run as a JSON record (timestamp + git commit + the active model
set/seed + the scores) and compares a run against the most recent prior one, so a
prompt or model change can be judged by what it did to precision/recall/F1 — the
"did this change help?" question the harness previously couldn't answer.

Dependency-free: json + pathlib, with git commit read best-effort via subprocess.
Runs land in EVAL_RUNS_DIR (default Backend/eval/runs/, gitignored — they're artifacts).
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Dict, List, Optional

_DEF_DIR = Path(__file__).resolve().parent / "runs"


def runs_dir() -> Path:
    d = Path(os.getenv("EVAL_RUNS_DIR", str(_DEF_DIR)))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _git_commit() -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5,
            cwd=str(Path(__file__).resolve().parent),
        )
        return out.stdout.strip() or None if out.returncode == 0 else None
    except Exception:
        return None


def _f1(tp: float, fp: float, fn: float) -> float:
    p = 1.0 if (tp + fp) == 0 else tp / (tp + fp)
    r = 1.0 if (tp + fn) == 0 else tp / (tp + fn)
    return 0.0 if (p + r) == 0 else 2 * p * r / (p + r)


def _models_meta() -> Dict[str, object]:
    # Best-effort: the active pinned model set + seed (providers.active_models, §10.3).
    try:
        import providers
        return providers.active_models()
    except Exception:
        return {}


def record_run(result: Dict[str, object], *, kind: str,
               extra_meta: Optional[Dict[str, object]] = None) -> Path:
    """Persist one scored run. `result` is a run_offline/run_online_accuracy dict
    ({overall, section_totals, rows}). Returns the path written."""
    overall = dict(result.get("overall", {}))
    record = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "kind": kind,
        "git_commit": _git_commit(),
        "models": _models_meta(),
        "n_cases": len(result.get("rows", []) or []),
        "overall": overall,
        "section_totals": result.get("section_totals", {}),
        **(extra_meta or {}),
    }
    fname = f"{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}_{kind}.json"
    path = runs_dir() / fname
    path.write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
    return path


def load_runs(kind: Optional[str] = None) -> List[Dict[str, object]]:
    """All persisted runs, oldest first; optionally filtered to one `kind`."""
    out = []
    for p in sorted(runs_dir().glob("*.json")):
        try:
            rec = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if kind is None or rec.get("kind") == kind:
            rec["_path"] = str(p)
            out.append(rec)
    return out


def compare(curr: Dict[str, object], prev: Dict[str, object],
            eps: float = 1e-9) -> Dict[str, object]:
    """Delta between two run records. `regressed` is True when overall F1 dropped."""
    co, po = curr.get("overall", {}), prev.get("overall", {})
    f1_delta = float(co.get("f1", 0.0)) - float(po.get("f1", 0.0))

    per_section = {}
    cst, pst = curr.get("section_totals", {}), prev.get("section_totals", {})
    for sec in sorted(set(cst) | set(pst)):
        c = cst.get(sec, {"tp": 0, "fp": 0, "fn": 0})
        p = pst.get(sec, {"tp": 0, "fp": 0, "fn": 0})
        per_section[sec] = round(
            _f1(c["tp"], c["fp"], c["fn"]) - _f1(p["tp"], p["fp"], p["fn"]), 4
        )

    return {
        "f1_delta": round(f1_delta, 4),
        "precision_delta": round(float(co.get("precision", 0.0)) - float(po.get("precision", 0.0)), 4),
        "recall_delta": round(float(co.get("recall", 0.0)) - float(po.get("recall", 0.0)), 4),
        "regressed": f1_delta < -eps,
        "per_section_f1_delta": per_section,
        "curr_commit": curr.get("git_commit"),
        "prev_commit": prev.get("git_commit"),
    }


def format_comparison(cmp: Dict[str, object]) -> str:
    arrow = "▼ REGRESSED" if cmp["regressed"] else ("▲ improved" if cmp["f1_delta"] > 0 else "= no change")
    lines = ["", "AI-EVAL — run comparison (vs previous)", "=" * 56,
             f"  {cmp.get('prev_commit') or '?'} -> {cmp.get('curr_commit') or '?'}   {arrow}",
             f"  F1 {cmp['f1_delta']:+.4f}   P {cmp['precision_delta']:+.4f}   R {cmp['recall_delta']:+.4f}"]
    moved = {s: d for s, d in cmp["per_section_f1_delta"].items() if abs(d) > 1e-9}
    if moved:
        lines.append("  per-section F1 deltas:")
        for sec, d in moved.items():
            lines.append(f"    {sec:<12}{d:+.4f}")
    lines.append("")
    return "\n".join(lines)
