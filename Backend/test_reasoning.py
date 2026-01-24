from database import SessionLocal
from models import KnowledgeNode
from reasoning_queries import get_decision_explanation

db = SessionLocal()

# Pick latest decision node
decision = db.query(KnowledgeNode)\
             .filter(KnowledgeNode.section == "DECISION")\
             .order_by(KnowledgeNode.created_at.desc())\
             .first()

print("DECISION:", decision.content)

explain = get_decision_explanation(db, decision.id)

print("\nSUPPORTED BY:")
for n in explain["supports"]:
    print("-", n.content)

print("\nCONFLICTS:")
for n in explain["conflicts"]:
    print("-", n.content)

print("\nBLOCKED BY:")
for n in explain["blockers"]:
    print("-", n.content)

print("\nALTERNATIVES:")
for n in explain["alternatives"]:
    print("-", n.content)

print("\nRefined DECISIONS:")
for n in explain.get("REFINES", []):
    print("-", n.content)
