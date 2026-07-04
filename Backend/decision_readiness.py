"""Decision Readiness (§17.5) — the capstone flagship.

Every other view surfaces ONE honest signal: where the models split (Disagreement
Spotlight), the case against (Devil's Advocate), how the thinking evolved (Delta), what
grounds a decision (Why-trace). This one fuses them into the question the product
actually exists to answer: *is this decision ready to act on yet, and if not, what is
the cheapest path to get there?*

It does that WITHOUT a single extra model call — it reads only signals already computed
and stored honestly:
  * measured inter-model agreement (§10.3) carried on the decision node's `confidence`;
  * the now-SEMANTIC KG edges (§16.2 fix / §17.4): grounded SUPPORTS / CONTRADICTS /
    BLOCKS / DEPENDS_ON links into the decision.

The output is not just a number but a *resolve-path*: the specific open questions,
conflicts, and unvalidated assumptions to address — each tagged with the readiness it
would unlock — so "raise this from Forming to Ready" becomes a concrete checklist.

Scoring is deliberately transparent (documented constants, like agreement.py) so it is
defensible and tunable, never a black-box gauge.
"""
from typing import Optional
from sqlalchemy.orm import Session

from reasoning_queries import get_decision_trace

# ── Tunable, documented weights (no magic numbers) ────────────────────────────
# Readiness is a balance around a NEUTRAL prior, NOT raw agreement rescaled: agreement
# is one *bounded* signal so a single low/noisy agreement number (e.g. the §16.1
# Llama-heavy ensemble) can't flatten every decision to 0 — friction and evidence still
# differentiate. Each term's range is explicit and small, so the score stays explainable.
NEUTRAL = 0.50            # prior before evidence/friction
NEUTRAL_AGREEMENT = 0.40  # measured agreement at/above this helps; below it hurts
AGREEMENT_SWING = 0.25    # agreement can move readiness by at most ±this
UNKNOWN_AGREEMENT_PENALTY = 0.05  # no measured agreement at all → mild caution
EVIDENCE_PER_SUPPORT = 0.07
EVIDENCE_CAP = 0.20       # grounded support can lift readiness by at most this much

# Per-item friction (also the readiness each item's resolution would UNLOCK).
LEVER = {
    "BLOCKS": 0.12,       # an open question is the biggest single drag on readiness
    "CONTRADICTS": 0.10,  # an unreconciled conflict
    "DEPENDS_ON": 0.05,   # an unvalidated assumption
}

READY_BAND = 0.66         # >= → "Ready"
FORMING_BAND = 0.40       # >= → "Forming"; below → "Exploratory"

# How to act on each friction relation, shown verbatim in the resolve-path.
_ACTION = {
    "BLOCKS": "Resolve open question",
    "CONTRADICTS": "Reconcile conflict",
    "DEPENDS_ON": "Validate assumption",
}
# Resolve-path priority: clear the biggest levers first.
_PRIORITY = ["BLOCKS", "CONTRADICTS", "DEPENDS_ON"]


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _band(score: float) -> str:
    if score >= READY_BAND:
        return "ready"
    if score >= FORMING_BAND:
        return "forming"
    return "exploratory"


def _score_one(confidence: Optional[float], links: list) -> dict:
    by_rel = {"SUPPORTS": [], "CONTRADICTS": [], "BLOCKS": [], "DEPENDS_ON": []}
    for l in links:
        by_rel.setdefault(l["relation"], []).append(l)

    # Agreement nudges readiness around the neutral prior, bounded to ±AGREEMENT_SWING
    # so one noisy number can't dominate (see §16.1). None => mild caution.
    if confidence is None:
        agreement_term = -UNKNOWN_AGREEMENT_PENALTY
    else:
        agreement_term = max(-AGREEMENT_SWING, min(AGREEMENT_SWING, float(confidence) - NEUTRAL_AGREEMENT))

    evidence_bonus = min(EVIDENCE_CAP, EVIDENCE_PER_SUPPORT * len(by_rel["SUPPORTS"]))
    friction = sum(LEVER.get(rel, 0.0) * len(items) for rel, items in by_rel.items())

    readiness = _clamp01(NEUTRAL + agreement_term + evidence_bonus - friction)

    # Resolve-path: the concrete items to address, biggest lever first.
    resolve_path = []
    for rel in _PRIORITY:
        for item in by_rel.get(rel, []):
            resolve_path.append({
                "kind": rel,
                "action": _ACTION[rel],
                "content": item["content"],
                "node_id": item.get("node_id"),
                # Readiness this single resolution would unlock (the friction it removes).
                "unlocks": round(LEVER.get(rel, 0.0), 3),
            })

    return {
        "readiness": round(readiness, 3),
        "band": _band(readiness),
        "agreement": None if confidence is None else round(float(confidence), 3),
        "evidence": {
            "support": len(by_rel["SUPPORTS"]),
            "conflict": len(by_rel["CONTRADICTS"]),
            "blocker": len(by_rel["BLOCKS"]),
            "depends_on": len(by_rel["DEPENDS_ON"]),
        },
        "resolve_path": resolve_path,
        "n_to_resolve": len(resolve_path),
    }


def compute_readiness(db: Session, chat_id: str) -> list:
    """Per-decision readiness + resolve-path for a chat. Pure read; no model call."""
    out = []
    for d in get_decision_trace(db, chat_id):
        scored = _score_one(d.get("confidence"), d.get("links", []))
        out.append({
            "decision_id": d["decision_id"],
            "synthesis_id": d.get("synthesis_id"),
            "decision": d["decision"],
            # §18.1: >1 when near-duplicate phrasings of this decision were merged.
            "n_variants": d.get("n_variants", 1),
            **scored,
        })
    # Least-ready first — that's where attention is needed.
    out.sort(key=lambda r: r["readiness"])
    return out
