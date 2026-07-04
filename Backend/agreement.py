"""
Measured inter-model agreement (§10.3) — the honest replacement for self-reported
confidence (§11.4).

The `/ask` ensemble runs N models over the same prompt; each emits structured IR
(FACT / CONSTRAINT / ...). A single model's *self-reported* "confidence" is
meaningless (§11.4): a model is equally fluent when right and when wrong, so the
number it writes about itself carries no signal. What we CAN measure — without a
single extra model call — is how much the independent models actually agreed on the
claims they extracted. That observed agreement is what this module computes, so the
CONFIDENCE the system reports is a measured quantity, not a vibe.

Method (lexical, deliberately simple, transparent, and dependency-free):
  * Parse each model's block into IR sections.
  * Within each comparable section, treat every bullet as one "claim".
  * Two claims are "the same" when their normalized token sets have Jaccard
    similarity >= SIM_THRESHOLD. No embeddings: this keeps the metric deterministic,
    offline, and unit-testable. The clustering API below is the seam to swap in
    embeddings later (§10.8 RAG) without changing callers.
  * Greedily cluster claims across models; a cluster's *support* = the number of
    DISTINCT models that contributed a claim to it.
  * Per-cluster agreement = (support - 1) / (n_models - 1)  -> 0.0 when only one
    model said it, 1.0 when every model said it.
  * Section / overall agreement = mean of per-cluster agreement.

Honesty constraints baked in:
  * SUMMARY (free prose) and CONFIDENCE (the thing we are replacing) are never scored.
  * With fewer than 2 responding models, agreement is undefined -> level
    "single_model", score None. We do NOT fabricate a number.
  * This is *lexical* agreement and the rendered output says so. It is a floor on
    semantic agreement (different words for the same idea read as disagreement),
    never an overclaim.
"""

from typing import Dict, List, Optional

# §18.1: claim matching now lives in claim_similarity (stemmed tokens +
# max(Jaccard, containment)). Raw-token Jaccard@0.5 read paraphrases of the SAME claim
# ("gradual improvements" vs "gradually improving") as different claims, so ensembles
# reported near-zero agreement and every claim showed as a contested lone claim.
from claim_similarity import SIM_THRESHOLD, claim_tokens, single_link_clusters

# --- thresholds (tunable; documented constants, not magic numbers) ---
HIGH_LEVEL = 0.66       # overall score >= => "high"
MEDIUM_LEVEL = 0.33     # overall score >= => "medium"

# Sections worth comparing across models. SUMMARY is free prose (always "differs"
# verbatim) and CONFIDENCE is exactly what we are replacing — both excluded.
COMPARABLE_SECTIONS = [
    "FACT", "CONSTRAINT", "ASSUMPTION", "OPTION", "DECISION", "CONFLICT", "UNKNOWN",
]

# Small, fixed stopword set so token overlap reflects content, not grammar. Kept
# intentionally tiny and explicit (no NLTK download) for determinism.
# (Tokenizing/stemming/matching now live in claim_similarity — single seam, §18.1.)


def _parse_sections(block: str) -> Dict[str, List[str]]:
    """Parse one model's IR block into {SECTION: [bullet, ...]}.

    Standalone (no DB / ir_parser dependency) so this stays unit-testable. Accepts
    the extraction IR shape: `HEADER:` lines followed by `- bullet` lines. Drops
    `- None` placeholders and bullets outside any known section.
    """
    sections: Dict[str, List[str]] = {}
    current: Optional[str] = None
    for raw in (block or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.endswith(":"):
            sec = line[:-1].strip().upper()
            current = sec if sec in COMPARABLE_SECTIONS else None
            continue
        if current and line.startswith("-"):
            clean = line.lstrip("- ").strip()
            if clean and clean.lower() != "none":
                sections.setdefault(current, []).append(clean)
    return sections


def _flatten_section(per_model_bullets: Dict[str, List[str]]) -> List[tuple]:
    """(model, bullet, tokens) triples in deterministic sorted-model order,
    skipping bullets with no content tokens."""
    flat = []
    for model in sorted(per_model_bullets):
        for bullet in per_model_bullets[model]:
            tok = claim_tokens(bullet)
            if tok:
                flat.append((model, bullet, tok))
    return flat


def _cluster_section(per_model_bullets: Dict[str, List[str]]) -> List[set]:
    """Cross-model clustering of one section's bullets (single-link union-find —
    §18.1: the old greedy first-fit pass was order-sensitive and stranded a
    paraphrase whenever its bridge claim arrived later).

    Returns a list of clusters; each cluster is the SET of distinct model labels
    that contributed a matching claim.
    """
    flat = _flatten_section(per_model_bullets)
    return [
        {flat[i][0] for i in idx}
        for idx in single_link_clusters([t[2] for t in flat])
    ]


def _level(score: Optional[float], n_models: int) -> str:
    if n_models < 2:
        return "single_model"
    if score is None:
        return "no_data"
    if score >= HIGH_LEVEL:
        return "high"
    if score >= MEDIUM_LEVEL:
        return "medium"
    return "low"


def compute_agreement(provider_blocks: Dict[str, str]) -> dict:
    """Measure inter-model agreement across the ensemble's IR blocks.

    Args:
        provider_blocks: {honest_model_label: raw_IR_text} for each model that
            actually responded.

    Returns a JSON-serializable dict:
        {
          "n_models": int,
          "score": float in [0,1] or None,   # None when undefined
          "level": "high"|"medium"|"low"|"single_model"|"no_data",
          "method": "lexical_stem_jaccard_overlap@0.5",
          "per_section": {SECTION: {"score": float, "clusters": int, "claims": int}},
        }
    """
    n_models = len(provider_blocks)

    # Agreement is undefined with fewer than 2 models — do NOT fabricate a number.
    if n_models < 2:
        return {
            "n_models": n_models,
            "score": None,
            "level": _level(None, n_models),
            "method": f"lexical_stem_jaccard_overlap@{SIM_THRESHOLD}",
            "per_section": {},
        }

    parsed = {m: _parse_sections(b) for m, b in provider_blocks.items()}

    per_section: Dict[str, dict] = {}
    cluster_scores: List[float] = []  # one entry per cluster, across all sections

    for section in COMPARABLE_SECTIONS:
        per_model = {m: secs[section] for m, secs in parsed.items() if secs.get(section)}
        total_claims = sum(len(v) for v in per_model.values())
        if total_claims == 0:
            continue
        clusters = _cluster_section(per_model)
        if not clusters:
            continue
        scores = [(len(models) - 1) / (n_models - 1) for models in clusters]
        section_score = sum(scores) / len(scores)
        per_section[section] = {
            "score": round(section_score, 3),
            "clusters": len(clusters),
            "claims": total_claims,
        }
        cluster_scores.extend(scores)

    overall = round(sum(cluster_scores) / len(cluster_scores), 3) if cluster_scores else None

    return {
        "n_models": n_models,
        "score": overall,
        "level": _level(overall, n_models),
        "method": f"lexical_stem_jaccard_overlap@{SIM_THRESHOLD}",
        "per_section": per_section,
    }


def _cluster_section_detailed(per_model_bullets: Dict[str, List[str]]) -> List[dict]:
    """Like `_cluster_section` but RETAINS the bullet text + per-model contributions.

    Powers the Disagreement Spotlight: we need not just *how many* models agreed, but
    *which* models said *what*. Same greedy Jaccard@SIM_THRESHOLD clustering, same
    deterministic sorted-model iteration as the scoring path.
    """
    flat = _flatten_section(per_model_bullets)
    return [
        {
            "models": {flat[i][0] for i in idx},
            "token_sets": [flat[i][2] for i in idx],
            "texts": [(flat[i][0], flat[i][1]) for i in idx],
        }
        for idx in single_link_clusters([t[2] for t in flat])
    ]


def analyze_claims(provider_blocks: Dict[str, str]) -> List[dict]:
    """Per-claim agreement detail across the ensemble — the Disagreement Spotlight core.

    Returns one entry per distinct claim (cluster):
        {section, text, models[], support, n_models, contested, agreement}
    where `contested` is True when fewer than ALL responding models extracted it.
    A claim only one model surfaced (`support == 1`) is the strongest contested
    signal — exactly where human judgment is most valuable in brainstorming.
    """
    n_models = len(provider_blocks)
    parsed = {m: _parse_sections(b) for m, b in provider_blocks.items()}
    out: List[dict] = []
    for section in COMPARABLE_SECTIONS:
        per_model = {m: secs[section] for m, secs in parsed.items() if secs.get(section)}
        if not per_model:
            continue
        for c in _cluster_section_detailed(per_model):
            models = sorted(c["models"])
            support = len(models)
            # Representative = shortest phrasing (usually the cleanest restatement).
            rep = min((t for _, t in c["texts"]), key=len)
            out.append({
                "section": section,
                "text": rep,
                "models": models,
                "support": support,
                "n_models": n_models,
                "contested": support < n_models,
                "agreement": round((support - 1) / (n_models - 1), 3) if n_models > 1 else None,
            })
    # Most-contested first (lowest support), then by section for stable display.
    out.sort(key=lambda c: (c["support"], c["section"]))
    return out


def contested_claims(provider_blocks: Dict[str, str]) -> List[dict]:
    """Only the claims NOT extracted by every model — the actionable disagreement."""
    return [c for c in analyze_claims(provider_blocks) if c["contested"]]


def confidence_bullets(result: dict) -> List[str]:
    """Render a measured-agreement result as CONFIDENCE-section bullets (IR `- ` lines).

    This is what gets persisted in the synthesis IR in place of the model's
    self-reported confidence. Always honest about being lexical and measured.
    """
    level = result.get("level")
    n = result.get("n_models", 0)
    score = result.get("score")

    if level == "single_model":
        return [f"Measured inter-model agreement unavailable — only {n} model responded."]
    if level == "no_data" or score is None:
        return [f"Measured inter-model agreement: no comparable claims across {n} models."]

    bullets = [
        f"Measured inter-model agreement: {score:.0%} ({level}) across {n} models "
        f"({result.get('method', 'lexical')}; self-reported confidence is not used)."
    ]
    for section, info in result.get("per_section", {}).items():
        bullets.append(
            f"{section}: {info['score']:.0%} agreement over {info['claims']} claims "
            f"in {info['clusters']} distinct groups."
        )
    return bullets
