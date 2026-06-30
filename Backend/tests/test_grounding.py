"""§10.6 grounding — cite synthesis bullets to source messages; flag ungrounded ones.

Pure tests cover the algorithm (coverage, citations, ratio, section scope). One
TestClient test proves the endpoint recomputes grounding from a stored synthesis +
its provider messages.
"""
import os
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ.setdefault("DATABASE_URL", "sqlite:///" + _db_path.replace("\\", "/"))
os.environ["RUN_MIGRATIONS_ON_STARTUP"] = "0"

import pytest
from fastapi.testclient import TestClient

from grounding import Source, ground_ir, cite_bullet, _coverage


# ----------------------------- pure algorithm -----------------------------

def test_coverage_is_asymmetric_short_bullet_in_long_source():
    bullet = {"postgres", "concurrent", "writers"}
    long_source = bullet | {"kafka", "redis", "react", "index", "cache", "queue"}
    # All 3 bullet tokens present -> coverage 1.0 even though the source is much larger
    # (symmetric Jaccard would be ~0.33 here — the reason we use coverage).
    assert _coverage(bullet, long_source) == 1.0


def test_grounded_bullet_cites_its_source():
    sources = [Source(id="m1", label="groq", text="Postgres handles concurrent writers safely")]
    cites = cite_bullet("Postgres handles concurrent writers", sources)
    assert len(cites) == 1
    assert cites[0]["message_id"] == "m1"
    assert cites[0]["sender"] == "groq"
    assert cites[0]["score"] >= 0.9


def test_hallucinated_bullet_is_flagged_ungrounded():
    sources = [Source(id="m1", text="Postgres handles concurrent writers")]
    ir = {"FACT": ["Redis evicts keys under memory pressure"]}  # nothing in the source
    res = ground_ir(ir, sources)
    assert res["total"] == 1 and res["grounded"] == 0
    assert res["grounding_ratio"] == 0.0
    assert res["bullets"][0]["grounded"] is False
    assert res["bullets"][0]["citations"] == []


def test_ratio_mixes_grounded_and_ungrounded():
    sources = [Source(id="m1", text="Adopt Postgres for the workspace store")]
    ir = {"DECISION": ["Adopt Postgres for the workspace store"],  # grounded
          "FACT": ["The moon is made of cheese"]}                   # ungrounded
    res = ground_ir(ir, sources)
    assert res["total"] == 2 and res["grounded"] == 1
    assert res["grounding_ratio"] == 0.5


def test_only_knowledge_sections_are_grounded():
    sources = [Source(id="m1", text="anything")]
    ir = {"SUMMARY": ["a summary line"], "CONFIDENCE": ["67%"], "FACT": ["unsupported claim"]}
    res = ground_ir(ir, sources)
    # SUMMARY/CONFIDENCE excluded -> only the one FACT bullet is scored.
    assert res["total"] == 1
    assert all(b["section"] == "FACT" for b in res["bullets"])


def test_vacuous_bullet_excluded_from_ratio():
    sources = [Source(id="m1", text="real content about postgres")]
    ir = {"FACT": ["the a of"]}  # all stopwords -> no content tokens
    res = ground_ir(ir, sources)
    assert res["total"] == 0 and res["grounding_ratio"] == 1.0
    assert res["bullets"][0].get("vacuous") is True


def test_citations_sorted_by_score_desc():
    sources = [
        Source(id="weak", text="postgres something unrelated entirely different words here"),
        Source(id="strong", text="Postgres handles concurrent writers safely without locks"),
    ]
    cites = cite_bullet("Postgres handles concurrent writers", sources, threshold=0.3)
    assert [c["message_id"] for c in cites][0] == "strong"
    assert cites == sorted(cites, key=lambda c: c["score"], reverse=True)


# ----------------------------- endpoint -----------------------------

def test_grounding_endpoint_recomputes_from_stored_synthesis():
    import database
    from models import Base, Project, ProjectMember, Chat, Message, Synthesis
    Base.metadata.create_all(bind=database.engine)

    import main
    from auth import get_current_user
    EMAIL = "ground@example.com"
    main.app.dependency_overrides[get_current_user] = lambda: {"email": EMAIL}

    db = database.SessionLocal()
    proj = Project(name="g", purpose="p", success_criteria="s", constraints="c",
                   owner=EMAIL, visibility="private")
    db.add(proj); db.commit(); db.refresh(proj)
    db.add(ProjectMember(project_id=proj.id, user_email=EMAIL, role="pm"))
    chat = Chat(project_id=proj.id, owner=EMAIL)
    db.add(chat); db.commit(); db.refresh(chat)
    group = "grp-1"
    # one provider message that supports a FACT; the other bullet will be unsupported.
    db.add(Message(chat_id=chat.id, role="assistant", sender="groq:llama",
                   text="Postgres handles concurrent writers safely", reply_group_id=group))
    synth = Synthesis(chat_id=chat.id, reply_group_id=group, model_used="test",
                      content="FACT:\n- Postgres handles concurrent writers\n"
                              "- Redis evicts keys under memory pressure\n")
    db.add(synth); db.commit()
    chat_id = chat.id
    db.close()

    try:
        client = TestClient(main.app)
        r = client.get(f"/chats/{chat_id}/synthesis/{group}/grounding")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reply_group_id"] == group
        assert body["total"] == 2 and body["grounded"] == 1
        assert body["grounding_ratio"] == 0.5
        # the grounded bullet cites the provider message; the other has no citations.
        by_text = {b["text"]: b for b in body["bullets"]}
        grounded = next(b for b in body["bullets"] if b["grounded"])
        assert grounded["citations"][0]["sender"] == "groq:llama"
    finally:
        main.app.dependency_overrides.clear()
