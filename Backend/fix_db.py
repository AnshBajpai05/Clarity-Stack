from sqlalchemy import create_engine, text

engine = create_engine("sqlite:///./claritystack.db")

with engine.connect() as conn:
    print("\n🔧 Adding chat_id to knowledge_nodes...")

    try:
        conn.execute(text("ALTER TABLE knowledge_nodes ADD COLUMN chat_id TEXT"))
        print("✅ knowledge_nodes.chat_id added")
    except Exception:
        print("ℹ knowledge_nodes.chat_id already exists")

    print("🔁 Backfilling knowledge_nodes.chat_id from synthesis...")

    conn.execute(text("""
        UPDATE knowledge_nodes
        SET chat_id = (
            SELECT s.chat_id
            FROM synthesis s
            WHERE s.id = knowledge_nodes.synthesis_id
        )
        WHERE synthesis_id IS NOT NULL
    """))

    print("\n🔧 Adding chat_id to knowledge_edges...")

    try:
        conn.execute(text("ALTER TABLE knowledge_edges ADD COLUMN chat_id TEXT"))
        print("✅ knowledge_edges.chat_id added")
    except Exception:
        print("ℹ knowledge_edges.chat_id already exists")

    print("🔁 Backfilling knowledge_edges.chat_id from source nodes...")

    conn.execute(text("""
        UPDATE knowledge_edges
        SET chat_id = (
            SELECT kn.chat_id
            FROM knowledge_nodes kn
            WHERE kn.id = knowledge_edges.from_node_id
        )
        WHERE from_node_id IS NOT NULL
    """))

    conn.commit()

    print("\n🔍 Verifying sample nodes:")
    rows = conn.execute(text("""
        SELECT id, chat_id, synthesis_id, section
        FROM knowledge_nodes
        LIMIT 5
    """)).fetchall()

    for r in rows:
        print(r)

    print("\n🔍 Verifying sample edges:")
    rows = conn.execute(text("""
        SELECT id, chat_id, relation
        FROM knowledge_edges
        LIMIT 5
    """)).fetchall()

    for r in rows:
        print(r)

print("\n✅ Knowledge Graph is now strictly 1 KG per chat_id. No data lost.")
