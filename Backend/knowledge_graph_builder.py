import re
from typing import Dict, List
from sqlalchemy.orm import Session
from models import KnowledgeNode, KnowledgeEdge

from uuid import uuid4
from datetime import datetime, timezone

def gen_id():
    return str(uuid4())

def now():
    return datetime.now(timezone.utc)


RELATION_MAP = {
    "FACT": "SUPPORTS",
    "CONFLICT": "CONTRADICTS",
    "OPTION": "ALTERNATIVE_OF",
    "UNKNOWN": "BLOCKS",
    "ASSUMPTION": "DEPENDS_ON",
    "DECISION_VERSION": "REFINES"
}

# §16.2 tail: SUMMARY is free prose and CONFIDENCE is run-varying metadata (the measured
# agreement %). Neither is project KNOWLEDGE, so neither should become a KnowledgeNode —
# they polluted the graph/trace and caused spurious Delta churn (their text changes every
# ask). Excluded from node creation; the synthesis CONTENT still keeps both sections.
KG_EXCLUDED_SECTIONS = {"SUMMARY", "CONFIDENCE"}

# ── §16.2 fix: semantic edge attribution (lexical, deterministic) ──────────────
# The old builder cross-producted EVERY non-decision node with EVERY decision node,
# asserting e.g. "Fact X SUPPORTS Decision Y" for all pairs — relationships that were
# fabricated, not extracted. With a single decision the cross-product is trivially
# correct (there's only one thing to support); the lie appears the moment a synthesis
# has 2+ decisions, where each fact got wired to all of them.
#
# We attribute each node to the decision(s) it is actually most related to, measured by
# lexical token overlap (same dependency-free Jaccard the agreement engine uses, §10.3).
# No overlap with any decision => we create NO edge rather than invent one. This is a
# floor on semantic relatedness, never an overclaim.
_WORD = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
    "is", "are", "be", "as", "at", "by", "it", "this", "that", "will", "should",
    "must", "can", "may", "from", "into", "via", "using", "use", "used", "we",
    "our", "their", "its", "if", "then", "than", "so", "such", "not", "no",
}


def _tokens(text: str) -> set:
    """Content tokens: lowercased alphanumerics, stopwords/1-char dropped (§10.3 parity)."""
    return {t for t in _WORD.findall((text or "").lower()) if len(t) > 1 and t not in _STOPWORDS}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


def relate_node_to_decisions(src_content: str, decision_contents: List[str]) -> List[int]:
    """Return the INDICES of the decisions `src_content` is most related to.

    * Exactly one decision -> attribute to it (unambiguous; the only correct target).
    * Multiple decisions   -> attribute to the decision(s) with the HIGHEST positive
      token overlap (ties included). Zero overlap with every decision -> [] (we do not
      fabricate an edge). Deterministic and unit-testable without a DB or model call.
    """
    n = len(decision_contents)
    if n == 0:
        return []
    if n == 1:
        return [0]
    st = _tokens(src_content)
    scores = [_jaccard(st, _tokens(dc)) for dc in decision_contents]
    best = max(scores)
    if best <= 0.0:
        return []  # no lexical evidence — honest silence beats a fabricated edge
    return [i for i, s in enumerate(scores) if s >= best - 1e-9]


def build_graph_from_ir(db: Session, chat_id: str, synthesis_id: str, ir: Dict[str, List[str]],
                        node_confidence: float = None):
    """Materialize synthesis IR into KnowledgeNodes/Edges.

    §10.3: `node_confidence` is the MEASURED inter-model agreement score (0..1) for
    this synthesis, or None when unknown (e.g. the /synthesis/generate path that has
    no ensemble). It populates the previously-always-None `confidence` column with a
    real, observed number instead of a self-reported guess.
    """
    nodes_by_section = {}

    for section, bullets in ir.items():
        if section in KG_EXCLUDED_SECTIONS:
            continue  # §16.2 tail: SUMMARY/CONFIDENCE are metadata, not knowledge nodes
        for text in bullets:
            node = KnowledgeNode(
                id=gen_id(),
                chat_id=chat_id,
                synthesis_id=synthesis_id,
                section=section,
                content=text,
                version=1,
                confidence=node_confidence,
                created_at=now()
            )
            db.add(node)
            db.flush()
            nodes_by_section.setdefault(section, []).append(node)

    decision_nodes = nodes_by_section.get("DECISION", [])
    decision_contents = [d.content for d in decision_nodes]

    for section, nodes in nodes_by_section.items():
        relation = RELATION_MAP.get(section)
        if not relation or not decision_nodes:
            continue

        for src in nodes:
            # §16.2: attribute this node only to the decision(s) it is lexically related
            # to — not to every decision. Empty => no edge (no fabricated relationship).
            for idx in relate_node_to_decisions(src.content, decision_contents):
                dst = decision_nodes[idx]
                db.add(KnowledgeEdge(
                    id=gen_id(),
                    chat_id=chat_id,                 # 🔒 CHAT SCOPE
                    from_node_id=src.id,
                    to_node_id=dst.id,
                    relation=relation,
                    created_at=now()
                ))

    db.commit()


def link_previous_decisions(db: Session, chat_id: str, old_synth_id: str, new_synth_id: str):
    old_nodes = db.query(KnowledgeNode).filter_by(
        chat_id=chat_id,
        synthesis_id=old_synth_id,
        section="DECISION"
    ).all()

    new_nodes = db.query(KnowledgeNode).filter_by(
        chat_id=chat_id,
        synthesis_id=new_synth_id,
        section="DECISION"
    ).all()

    for old in old_nodes:
        for new in new_nodes:
            db.add(KnowledgeEdge(
                id=gen_id(),
                chat_id=chat_id,                  # 🔒 REQUIRED
                from_node_id=old.id,
                to_node_id=new.id,
                relation="REFINES",
                created_at=now()
            ))

    db.commit()
