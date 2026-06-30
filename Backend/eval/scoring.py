"""Content-overlap scoring for extracted IR vs. expected IR.

A predicted bullet matches an expected bullet when they share enough content tokens
(Jaccard >= threshold) AND sit in the same section. We reuse the SAME token model as
the KG edge builder (`_tokens`/`_jaccard`, §10.3 parity) so "related" means the same
thing everywhere in the system — no second, divergent notion of similarity.

Matching is greedy on descending overlap, one-to-one (an expected bullet is consumed by
at most one prediction), which is the standard precision/recall setup for set extraction:
  TP = expected bullets matched   FP = predictions that matched nothing
  FN = expected bullets unmatched
"""
from __future__ import annotations

from typing import Dict, List, Tuple

# Single source of truth for the token model (lowercased alnum, stopwords/1-char dropped).
from knowledge_graph_builder import _tokens, _jaccard

DEFAULT_THRESHOLD = 0.4


def _f1(precision: float, recall: float) -> float:
    return 0.0 if (precision + recall) == 0 else 2 * precision * recall / (precision + recall)


def match_bullets(
    predicted: List[str], expected: List[str], threshold: float = DEFAULT_THRESHOLD
) -> Tuple[int, List[Tuple[int, int, float]]]:
    """Greedy one-to-one match. Returns (true_positives, [(pred_i, exp_j, score), ...])."""
    pred_tok = [_tokens(p) for p in predicted]
    exp_tok = [_tokens(e) for e in expected]

    candidates: List[Tuple[float, int, int]] = []
    for i, pt in enumerate(pred_tok):
        for j, et in enumerate(exp_tok):
            s = _jaccard(pt, et)
            if s >= threshold:
                candidates.append((s, i, j))
    candidates.sort(reverse=True)  # highest overlap first

    used_pred, used_exp, pairs = set(), set(), []
    for s, i, j in candidates:
        if i in used_pred or j in used_exp:
            continue
        used_pred.add(i)
        used_exp.add(j)
        pairs.append((i, j, s))
    return len(pairs), pairs


def score_section(
    predicted: List[str], expected: List[str], threshold: float = DEFAULT_THRESHOLD
) -> Dict[str, float]:
    """Precision/recall/F1 for one section's bullets."""
    tp, _ = match_bullets(predicted, expected, threshold)
    fp = len(predicted) - tp
    fn = len(expected) - tp
    precision = 1.0 if not predicted else tp / len(predicted)
    recall = 1.0 if not expected else tp / len(expected)
    return {
        "tp": tp, "fp": fp, "fn": fn,
        "precision": precision, "recall": recall, "f1": _f1(precision, recall),
    }


def score_ir(
    predicted: Dict[str, List[str]],
    expected: Dict[str, List[str]],
    threshold: float = DEFAULT_THRESHOLD,
) -> Dict[str, object]:
    """Score a full IR. Sections present in EITHER dict are evaluated, so a hallucinated
    section (present in predicted, absent in expected) is penalized as pure false
    positives, and a dropped section as pure false negatives."""
    sections = sorted(set(predicted) | set(expected))
    per_section = {
        sec: score_section(predicted.get(sec, []), expected.get(sec, []), threshold)
        for sec in sections
    }
    overall = ir_micro_average(per_section)
    return {"per_section": per_section, "overall": overall}


def ir_micro_average(per_section: Dict[str, Dict[str, float]]) -> Dict[str, float]:
    """Micro-average: pool TP/FP/FN across sections (weights each bullet equally, so a
    section with more bullets contributes proportionally — the honest aggregate)."""
    tp = sum(s["tp"] for s in per_section.values())
    fp = sum(s["fp"] for s in per_section.values())
    fn = sum(s["fn"] for s in per_section.values())
    precision = 1.0 if (tp + fp) == 0 else tp / (tp + fp)
    recall = 1.0 if (tp + fn) == 0 else tp / (tp + fn)
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": precision, "recall": recall, "f1": _f1(precision, recall)}
