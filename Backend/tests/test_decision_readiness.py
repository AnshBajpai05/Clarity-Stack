"""§17.5 Decision Readiness — scoring bands + resolve-path ordering + edge-grounded
integration. In-memory SQLite, no network."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models  # noqa: F401
from models import Base
from knowledge_graph_builder import build_graph_from_ir
from decision_readiness import compute_readiness, _score_one


def test_clean_decision_is_ready_with_empty_resolve_path():
    r = _score_one(0.85, [{"relation": "SUPPORTS", "content": "x", "node_id": "1"},
                          {"relation": "SUPPORTS", "content": "y", "node_id": "2"}])
    assert r["band"] == "ready" and r["resolve_path"] == []


def test_resolve_path_is_biggest_lever_first():
    r = _score_one(0.85, [
        {"relation": "DEPENDS_ON", "content": "assume", "node_id": "a"},
        {"relation": "CONTRADICTS", "content": "conflict", "node_id": "c"},
        {"relation": "BLOCKS", "content": "open question", "node_id": "b"},
    ])
    assert [s["kind"] for s in r["resolve_path"]] == ["BLOCKS", "CONTRADICTS", "DEPENDS_ON"]
    assert r["band"] in ("forming", "exploratory")


def test_integration_clean_vs_contested_decision():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    db = sessionmaker(bind=eng)()
    ir = {
        "FACT": ["Postgres handles concurrent writers safely", "Postgres has mature tooling"],
        "DECISION": ["Adopt Postgres for the workspace storage", "Use Kafka for the event bus"],
        "UNKNOWN": ["Kafka operational complexity is unproven for our team"],
        "CONFLICT": ["Kafka adds heavy operational cost however"],
    }
    build_graph_from_ir(db, "c", "s", ir, node_confidence=0.85)

    res = compute_readiness(db, "c")
    assert res == sorted(res, key=lambda r: r["readiness"])   # least-ready first
    pg = next(r for r in res if "Postgres" in r["decision"])
    kafka = next(r for r in res if "Kafka" in r["decision"])

    assert pg["band"] == "ready" and pg["evidence"]["support"] == 2 and pg["resolve_path"] == []
    assert kafka["readiness"] < pg["readiness"]
    assert kafka["evidence"]["blocker"] == 1 and kafka["evidence"]["conflict"] == 1
    assert [s["kind"] for s in kafka["resolve_path"]] == ["BLOCKS", "CONTRADICTS"]
