"""Integration test for POST /chats/{chat_id}/kg/ingest — §16.4 Issue 2.

Proves the "Commit to KG" path now lands in the Core Postgres KG (the single source of truth
the graph view reads via /api/reasoning/chat/{chat_id}), instead of the old dead-end write into
the Satellite KGSnapshot mirror. Runs the real handler end-to-end against a throwaway SQLite DB.

Asserts:
  * card nodes + edges are inserted and show up in /api/reasoning for the same chat,
  * re-committing the same diff is idempotent (no duplicate nodes/edges),
  * edges referencing nodes outside the payload are skipped (no orphan FK).
"""
import os
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["DATABASE_URL"] = "sqlite:///" + _db_path.replace("\\", "/")
os.environ["RUN_MIGRATIONS_ON_STARTUP"] = "0"
os.environ.setdefault("GROQ_API_KEY", "test")
os.environ.setdefault("NVIDIA_API_KEY", "test")

import pytest
from fastapi.testclient import TestClient

import database
from models import Base, Project, ProjectMember, Chat, KnowledgeNode, KnowledgeEdge

Base.metadata.create_all(bind=database.engine)

import main
from auth import get_current_user

TEST_EMAIL = "kgtester@example.com"


@pytest.fixture(scope="module")
def client():
    main.app.dependency_overrides[get_current_user] = lambda: {"email": TEST_EMAIL}

    db = database.SessionLocal()
    proj = Project(name="t", purpose="p", success_criteria="s", constraints="c",
                   owner=TEST_EMAIL, visibility="private")
    db.add(proj); db.commit(); db.refresh(proj)
    db.add(ProjectMember(project_id=proj.id, user_email=TEST_EMAIL, role="pm"))
    chat = Chat(project_id=proj.id, owner=TEST_EMAIL)
    db.add(chat); db.commit(); db.refresh(chat)
    chat_id = chat.id
    db.close()

    c = TestClient(main.app)
    c._chat_id = chat_id
    yield c
    main.app.dependency_overrides.clear()


_PAYLOAD = {
    "nodes": [
        {"id": "c1", "label": "Adopt Postgres for primary store", "type": "decision", "confidence": 0.9},
        {"id": "c2", "label": "SQLite serializes writes", "type": "fact", "confidence": 0.8},
    ],
    "edges": [
        {"from": "c1", "to": "c2", "label": "supports"},
        {"from": "c1", "to": "ghost", "label": "supports"},   # ghost not in payload → skipped
    ],
    "confidence": 0.85,
}


def test_ingest_lands_in_core_kg_and_is_idempotent(client):
    cid = client._chat_id

    # First commit: 2 nodes, 1 valid edge (the ghost edge is dropped).
    r = client.post(f"/chats/{cid}/kg/ingest", json=_PAYLOAD)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["added_nodes"] == 2
    assert body["added_edges"] == 1          # ghost edge skipped, no orphan FK

    # Nodes are persisted to Core Postgres KG and render via the reasoning endpoint.
    rr = client.get(f"/api/reasoning/chat/{cid}")
    assert rr.status_code == 200, rr.text
    rdata = rr.json()
    contents = {n["content"] for grp in
                ("decision", "supports", "conflicts", "blockers", "alternatives", "others")
                for n in rdata.get(grp, [])}
    assert "Adopt Postgres for primary store" in contents
    assert "SQLite serializes writes" in contents
    # decision-sectioned node lands in the 'decision' bucket the graph reads.
    assert any(n["content"] == "Adopt Postgres for primary store" for n in rdata["decision"])

    # Second identical commit: idempotent — no duplicate nodes/edges.
    r2 = client.post(f"/chats/{cid}/kg/ingest", json=_PAYLOAD)
    assert r2.status_code == 200, r2.text
    assert r2.json()["added_nodes"] == 0
    assert r2.json()["added_edges"] == 0

    db = database.SessionLocal()
    try:
        assert db.query(KnowledgeNode).filter(KnowledgeNode.chat_id == cid).count() == 2
        assert db.query(KnowledgeEdge).filter(KnowledgeEdge.chat_id == cid).count() == 1
    finally:
        db.close()


def test_ingest_requires_project_access(client):
    # A chat under a project the caller is not a member of → 404 (no tenancy leak).
    db = database.SessionLocal()
    other = Project(name="o", purpose="p", success_criteria="s", constraints="c",
                    owner="someone-else@example.com", visibility="private")
    db.add(other); db.commit(); db.refresh(other)
    other_chat = Chat(project_id=other.id, owner="someone-else@example.com")
    db.add(other_chat); db.commit(); db.refresh(other_chat)
    other_chat_id = other_chat.id
    db.close()

    r = client.post(f"/chats/{other_chat_id}/kg/ingest", json=_PAYLOAD)
    assert r.status_code == 404, r.text
