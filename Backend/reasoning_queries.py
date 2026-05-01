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
    decision_nodes = db.query(KnowledgeNode).filter(
        KnowledgeNode.chat_id == chat_id,     # 🔒 CHAT SCOPED
        KnowledgeNode.section == "DECISION"
    ).all()

    if not decision_nodes:
        return {
            "decision": [],
            "supports": [],
            "conflicts": [],
            "blockers": [],
            "alternatives": []
        }

    supports, conflicts, blockers, alternatives = [], [], [], []

    for d in decision_nodes:
        supports += get_supporting_facts(db, chat_id, d.id)
        conflicts += get_conflicts(db, chat_id, d.id)
        blockers += get_blockers(db, chat_id, d.id)
        alternatives += get_alternatives(db, chat_id, d.id)

    return {
        "decision": decision_nodes,
        "supports": supports,
        "conflicts": conflicts,
        "blockers": blockers,
        "alternatives": alternatives
    }
