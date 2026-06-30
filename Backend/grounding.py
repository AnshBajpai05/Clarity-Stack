"""Grounding: cite each synthesis bullet back to the source messages (§10.6).

The structural validator (synthesis_service.validate_ir_structure) already enforces that
synthesis output is well-formed IR. This is the OTHER half of hallucination control:
does each knowledge bullet actually trace to something a provider said? For every IR
bullet we find the source messages whose text COVERS the bullet's content tokens; a
bullet with no covering source is flagged `grounded: false` — the hallucination signal.

We reuse the KG/eval token model (`knowledge_graph_builder._tokens`, §10.3 parity) so
"these words match" means the same thing everywhere. But grounding uses an ASYMMETRIC
*coverage* measure (fraction of the bullet's tokens present in the source), not Jaccard:
a one-line bullet fully contained in a long multi-bullet source should score ~1.0, which
symmetric Jaccard would wrongly dilute.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Set

from knowledge_graph_builder import _tokens

# Only the substantive knowledge sections are grounded. SUMMARY/CONFIDENCE are
# model-/measurement-generated metadata, not claims to trace to a source.
KNOWLEDGE_SECTIONS = (
    "FACT", "OPTION", "DECISION", "CONFLICT", "UNKNOWN", "CONSTRAINT", "ASSUMPTION",
)
DEFAULT_THRESHOLD = 0.6


@dataclass
class Source:
    id: str
    text: str
    label: str = field(default="")   # provider/sender, for display


def _coverage(bullet_tokens: Set[str], source_tokens: Set[str]) -> float:
    """Fraction of the bullet's content tokens that appear in the source. A vacuous
    bullet (no content tokens) is treated as fully covered."""
    if not bullet_tokens:
        return 1.0
    return len(bullet_tokens & source_tokens) / len(bullet_tokens)


def cite_bullet(bullet: str, sources: List[Source],
                threshold: float = DEFAULT_THRESHOLD) -> List[Dict[str, object]]:
    """Citations for one bullet: sources covering it at/above `threshold`, best first."""
    bt = _tokens(bullet)
    cites = []
    for s in sources:
        cov = _coverage(bt, _tokens(s.text))
        if cov >= threshold:
            cites.append({"message_id": s.id, "sender": s.label, "score": round(cov, 3)})
    cites.sort(key=lambda c: c["score"], reverse=True)
    return cites


def ground_ir(ir: Dict[str, List[str]], sources: List[Source],
              threshold: float = DEFAULT_THRESHOLD,
              sections=KNOWLEDGE_SECTIONS) -> Dict[str, object]:
    """Cite every knowledge bullet to its supporting sources and report a grounding
    ratio (grounded bullets / non-vacuous bullets). Vacuous bullets are excluded from
    the ratio so they neither inflate nor deflate it."""
    # Precompute source token sets once (not per bullet).
    src_tokens = [(s, _tokens(s.text)) for s in sources]

    bullets: List[Dict[str, object]] = []
    grounded_n = 0
    total_n = 0
    for sec in sections:
        for b in ir.get(sec, []):
            bt = _tokens(b)
            if not bt:
                # vacuous (all stopwords/punctuation) — record but exclude from ratio
                bullets.append({"section": sec, "text": b, "grounded": True,
                                "vacuous": True, "citations": []})
                continue
            cites = []
            for s, st in src_tokens:
                cov = _coverage(bt, st)
                if cov >= threshold:
                    cites.append({"message_id": s.id, "sender": s.label, "score": round(cov, 3)})
            cites.sort(key=lambda c: c["score"], reverse=True)
            grounded = bool(cites)
            total_n += 1
            grounded_n += 1 if grounded else 0
            bullets.append({"section": sec, "text": b, "grounded": grounded, "citations": cites})

    ratio = 1.0 if total_n == 0 else grounded_n / total_n
    return {
        "grounding_ratio": round(ratio, 3),
        "grounded": grounded_n,
        "total": total_n,
        "threshold": threshold,
        "bullets": bullets,
    }
