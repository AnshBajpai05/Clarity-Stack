from sqlalchemy.orm import Session
from models import KnowledgeNode, KnowledgeEdge


def get_supporting_facts(db: Session, chat_id: str, decision_id: str):
    return db.query(KnowledgeNode).join(
        KnowledgeEdge, KnowledgeEdge.from_node_id == KnowledgeNode.id
    ).filter(
        KnowledgeEdge.chat_id == chat_id,          # 🔒 CHAT SCOPE
        KnowledgeEdge.to_node_id == decision_id,
        KnowledgeEdge.relation == "SUPPORTS"
    ).all()


def get_conflicts(db: Session, chat_id: str, decision_id: str):
    return db.query(KnowledgeNode).join(
        KnowledgeEdge, KnowledgeEdge.from_node_id == KnowledgeNode.id
    ).filter(
        KnowledgeEdge.chat_id == chat_id,
        KnowledgeEdge.to_node_id == decision_id,
        KnowledgeEdge.relation == "CONTRADICTS"
    ).all()


def get_blockers(db: Session, chat_id: str, decision_id: str):
    return db.query(KnowledgeNode).join(
        KnowledgeEdge, KnowledgeEdge.from_node_id == KnowledgeNode.id
    ).filter(
        KnowledgeEdge.chat_id == chat_id,
        KnowledgeEdge.to_node_id == decision_id,
        KnowledgeEdge.relation == "BLOCKS"
    ).all()


def get_alternatives(db: Session, chat_id: str, decision_id: str):
    return db.query(KnowledgeNode).join(
        KnowledgeEdge, KnowledgeEdge.from_node_id == KnowledgeNode.id
    ).filter(
        KnowledgeEdge.chat_id == chat_id,
        KnowledgeEdge.to_node_id == decision_id,
        KnowledgeEdge.relation == "ALTERNATIVE_OF"
    ).all()


def get_decision_explanation(db: Session, chat_id: str):
    # 1. Fetch ALL nodes for this chat
    all_nodes = db.query(KnowledgeNode).filter(
        KnowledgeNode.chat_id == chat_id
    ).all()

    if not all_nodes:
        return {
            "decision": [],
            "supports": [],
            "conflicts": [],
            "blockers": [],
            "alternatives": [],
            "others": [],
            "edges": []
        }

    # 2. Fetch ALL edges for this chat
    all_edges = db.query(KnowledgeEdge).filter(
        KnowledgeEdge.chat_id == chat_id
    ).all()

    # 3. Categorize nodes for the UI and Satellite engine
    # We use explicit checks for common sections to maintain legacy compatibility
    # but the 'others' list catches everything else.
    decision_nodes = [n for n in all_nodes if n.section == "DECISION"]
    supports       = [n for n in all_nodes if n.section == "FACT"]
    conflicts      = [n for n in all_nodes if n.section == "CONFLICT"]
    blockers       = [n for n in all_nodes if n.section in ["UNKNOWN", "BLOCKER"]]
    alternatives   = [n for n in all_nodes if n.section in ["OPTION", "ALTERNATIVE"]]
    
    # Catch-all for other sections (Assumptions, Constraints, etc.)
    known_sections = ["DECISION", "FACT", "CONFLICT", "UNKNOWN", "BLOCKER", "OPTION", "ALTERNATIVE"]
    others = [n for n in all_nodes if n.section not in known_sections]

    return {
        "decision": decision_nodes,
        "supports": supports,
        "conflicts": conflicts,
        "blockers": blockers,
        "alternatives": alternatives,
        "others": others,
        "edges": all_edges
    }


# Human-readable phrasing for each grounded relation (drives the "Why this decision?" UI).
_RELATION_PHRASE = {
    "SUPPORTS": "rests on",
    "CONTRADICTS": "is challenged by",
    "BLOCKS": "is blocked by",
    "DEPENDS_ON": "depends on",
    "ALTERNATIVE_OF": "was chosen over",
    "REFINES": "refines",
}


def get_decision_trace(db: Session, chat_id: str):
    """"Why this decision?" — an EDGE-GROUNDED explanation per decision (§17.4).

    Unlike `get_decision_explanation` (which buckets every node by section and so shows
    the same facts under every decision), this walks the actual KnowledgeEdges into each
    DECISION node, so a decision only lists the evidence/conflicts it is genuinely linked
    to. Now that edges are semantic (§16.2 fix in knowledge_graph_builder) instead of a
    cross-product, that link set is meaningful. We also surface the shared terms that
    justified each link, so the trace is auditable rather than asserted.
    """
    from knowledge_graph_builder import _tokens

    nodes = {n.id: n for n in db.query(KnowledgeNode).filter(KnowledgeNode.chat_id == chat_id).all()}
    edges = db.query(KnowledgeEdge).filter(KnowledgeEdge.chat_id == chat_id).all()

    incoming: dict = {}
    for e in edges:
        incoming.setdefault(e.to_node_id, []).append(e)

    out = []
    for d in (n for n in nodes.values() if n.section == "DECISION"):
        d_tokens = _tokens(d.content)
        links = []
        for e in incoming.get(d.id, []):
            src = nodes.get(e.from_node_id)
            if not src:
                continue
            shared = sorted(_tokens(src.content) & d_tokens)
            links.append({
                "relation": e.relation,
                "phrase": _RELATION_PHRASE.get(e.relation, e.relation.lower()),
                "section": src.section,
                "content": src.content,
                "node_id": src.id,
                "shared_terms": shared[:6],
            })
        # Most-grounded links first (more shared terms = stronger justification).
        links.sort(key=lambda l: (-len(l["shared_terms"]), l["section"]))
        out.append({
            "decision_id": d.id,
            "synthesis_id": d.synthesis_id,
            "decision": d.content,
            "confidence": d.confidence,
            "links": links,
            "n_links": len(links),
        })
    return out
