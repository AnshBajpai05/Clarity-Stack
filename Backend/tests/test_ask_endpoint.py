"""Integration test for POST /chats/{chat_id}/ask — the core pipeline.

Runs the real FastAPI handler end-to-end against a throwaway SQLite DB, with auth
overridden and the LLM + signal classifier stubbed (no network, no real models).
It proves the two correctness wins reach the live path:
  * provider messages are stored with HONEST model labels (groq:/nvidia:), not the
    old fictional "gemini"/"huggingface" (§10.3),
  * the persisted synthesis CONFIDENCE is the MEASURED inter-model agreement, and the
    model's self-reported confidence is discarded (§10.3 / §11.4).

Env must be set before importing the app, so it happens at module import time.
"""
import os
import tempfile

# ── point the app at a temp SQLite DB + skip startup migrations (we create_all) ──
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["DATABASE_URL"] = "sqlite:///" + _db_path.replace("\\", "/")
os.environ["RUN_MIGRATIONS_ON_STARTUP"] = "0"
os.environ.setdefault("GROQ_API_KEY", "test")
os.environ.setdefault("NVIDIA_API_KEY", "test")

import pytest
from fastapi.testclient import TestClient

import database
from models import Base, Project, ProjectMember, Chat, Synthesis, Message

Base.metadata.create_all(bind=database.engine)

import main
from auth import get_current_user

TEST_EMAIL = "tester@example.com"

# Honest ensemble stub: two models that AGREE on one FACT and DIVERGE on another.
_BLOCK_A = "SUMMARY:\n- ans\nFACT:\n- system stores data in postgres\n- billing is monthly\nCONFIDENCE:\n- None\n"
_BLOCK_B = "SUMMARY:\n- ans\nFACT:\n- data is stored in postgres by the system\nCONFIDENCE:\n- None\n"


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


def _stub_llm(monkeypatch):
    # Deterministic classifier + ensemble + synthesis — no network, no model load.
    monkeypatch.setattr(main, "classify_signal", lambda text: "high")
    monkeypatch.setattr(main, "EXTRACTION_ENSEMBLE", [
        ("groq:llama-3.3-70b-versatile", lambda prompt: _BLOCK_A),
        ("nvidia:meta/llama-3.1-70b-instruct", lambda prompt: _BLOCK_B),
    ])
    # Synthesis returns a valid IR carrying a self-reported CONFIDENCE we expect to be
    # overwritten by the measured value.
    synth_ir = ("SUMMARY:\n- merged\nFACT:\n- system stores data in postgres\n"
                "CONFIDENCE:\n- I am absolutely certain\n")
    monkeypatch.setattr(main, "synthesize_content", lambda blocks: synth_ir)


def test_ask_persists_honest_labels_and_measured_confidence(client, monkeypatch):
    _stub_llm(monkeypatch)

    r = client.post(f"/chats/{client._chat_id}/ask",
                    json={"sender": TEST_EMAIL, "text": "What database should we use?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    assert body.get("synthesis_id")

    db = database.SessionLocal()
    try:
        # 1. provider messages carry HONEST model labels, never the old lies.
        senders = {m.sender for m in db.query(Message)
                   .filter(Message.chat_id == client._chat_id,
                           Message.role == "assistant",
                           Message.reply_group_id.isnot(None)).all()
                   if m.sender != "synthesis"}
        assert any(s.startswith("groq:") for s in senders), senders
        assert any(s.startswith("nvidia:") for s in senders), senders
        assert "gemini" not in senders and "huggingface" not in senders

        # 2. persisted synthesis CONFIDENCE is MEASURED, self-report discarded.
        synth = db.query(Synthesis).filter(
            Synthesis.id == body["synthesis_id"]).first()
        assert synth is not None
        assert "Measured inter-model agreement" in synth.content
        assert "absolutely certain" not in synth.content
    finally:
        db.close()


def test_ask_noise_is_filtered(client, monkeypatch):
    monkeypatch.setattr(main, "classify_signal", lambda text: "noise")
    r = client.post(f"/chats/{client._chat_id}/ask",
                    json={"sender": TEST_EMAIL, "text": "lol ok"})
    assert r.status_code == 200
    assert r.json()["status"] == "noise_filtered"
