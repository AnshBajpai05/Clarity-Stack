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


def build_graph_from_ir(db: Session, chat_id: str, synthesis_id: str, ir: Dict[str, List[str]]):
    nodes_by_section = {}

    for section, bullets in ir.items():
        for text in bullets:
            node = KnowledgeNode(
                id=gen_id(),
                chat_id=chat_id,
                synthesis_id=synthesis_id,
                section=section,
                content=text,
                version=1,
                confidence=None,
                created_at=now()
            )
            db.add(node)
            db.flush()
            nodes_by_section.setdefault(section, []).append(node)

    decision_nodes = nodes_by_section.get("DECISION", [])

    for section, nodes in nodes_by_section.items():
        relation = RELATION_MAP.get(section)
        if not relation or not decision_nodes:
            continue

        for src in nodes:
            for dst in decision_nodes:
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
