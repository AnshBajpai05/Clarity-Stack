from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DB_URL = "sqlite:///./claritystack.db"  # adjust if needed

engine = create_engine(DB_URL)
Session = sessionmaker(bind=engine)
db = Session()

SYNTH_ID = "d2d38172-860b-4bed-91f7-e92b268057a5"  # paste the one you clicked in UI

print("\n🔎 Checking synthesis existence...")
s = db.execute(text("SELECT id, content FROM synthesis WHERE id=:sid"), {"sid": SYNTH_ID}).fetchone()
print("SYNTHESIS:", s)

print("\n🔎 Checking decision nodes for this synthesis...")
nodes = db.execute(text("""
    SELECT id, section, content
    FROM knowledge_nodes
    WHERE synthesis_id=:sid AND section='DECISION'
"""), {"sid": SYNTH_ID}).fetchall()

print("DECISION NODES:", nodes)

if not nodes:
    print("\n❌ No decision nodes linked to this synthesis_id")
    exit()

decision_ids = [n[0] for n in nodes]

print("\n🔎 Checking edges pointing to these decisions...")
edges = db.execute(text("""
    SELECT relation, from_node_id, to_node_id
    FROM knowledge_edges
    WHERE to_node_id IN :ids
"""), {"ids": tuple(decision_ids)}).fetchall()

print("EDGES:", edges)

print("\n🔎 Fetching supporting nodes...")
supports = db.execute(text("""
    SELECT n.section, n.content
    FROM knowledge_nodes n
    JOIN knowledge_edges e ON e.from_node_id = n.id
    WHERE e.to_node_id IN :ids AND e.relation='SUPPORTS'
"""), {"ids": tuple(decision_ids)}).fetchall()

print("SUPPORTS:", supports)

print("\n🔎 Conflicts...")
conflicts = db.execute(text("""
    SELECT n.section, n.content
    FROM knowledge_nodes n
    JOIN knowledge_edges e ON e.from_node_id = n.id
    WHERE e.to_node_id IN :ids AND e.relation='CONTRADICTS'
"""), {"ids": tuple(decision_ids)}).fetchall()

print("CONFLICTS:", conflicts)

print("\n🔎 Alternatives...")
alts = db.execute(text("""
    SELECT n.section, n.content
    FROM knowledge_nodes n
    JOIN knowledge_edges e ON e.from_node_id = n.id
    WHERE e.to_node_id IN :ids AND e.relation='ALTERNATIVE_OF'
"""), {"ids": tuple(decision_ids)}).fetchall()

print("ALTERNATIVES:", alts)

print("\n🔎 Blockers...")
blocks = db.execute(text("""
    SELECT n.section, n.content
    FROM knowledge_nodes n
    JOIN knowledge_edges e ON e.from_node_id = n.id
    WHERE e.to_node_id IN :ids AND e.relation='BLOCKS'
"""), {"ids": tuple(decision_ids)}).fetchall()

print("BLOCKERS:", blocks)

print("\n✅ If supports/conflicts/etc show data here but API returns empty, your API filter is wrong.")
print("❌ If they are empty here too, your graph was built under a different synthesis_id.")
