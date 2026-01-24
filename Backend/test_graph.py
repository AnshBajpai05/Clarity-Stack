from sqlalchemy.orm import Session
from database import SessionLocal
from models import Synthesis, KnowledgeNode, KnowledgeEdge

def main():
    db: Session = SessionLocal()

    print("\n=== Latest Synthesis ===")
    synth = db.query(Synthesis).order_by(Synthesis.created_at.desc()).first()
    if not synth:
        print("No synthesis found.")
        return

    print("Synthesis ID:", synth.id)
    print(synth.content)

    print("\n=== Knowledge Nodes ===")
    nodes = db.query(KnowledgeNode).filter(KnowledgeNode.synthesis_id == synth.id).all()
    for n in nodes:
        print(f"[{n.section}] {n.content}")

    print("\n=== Knowledge Edges ===")
    edges = db.query(KnowledgeEdge).all()
    for e in edges:
        print(f"{e.relation}: {e.from_node_id} -> {e.to_node_id}")

    print("\n=== Counts ===")
    print("Total Nodes:", len(nodes))
    print("Total Edges:", len(edges))

if __name__ == "__main__":
    main()
