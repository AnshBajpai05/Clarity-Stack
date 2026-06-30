"""§16.2/§17.4 — KG edges are semantic (not a cross-product); metadata isn't a node;
the 'Why this decision?' trace is edge-grounded. In-memory SQLite, no network."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models  # noqa: F401  (ensures mappers are registered)
from models import Base, KnowledgeNode, KnowledgeEdge
from knowledge_graph_builder import (
    build_graph_from_ir, relate_node_to_decisions, KG_EXCLUDED_SECTIONS,
)
from reasoning_queries import get_decision_trace


def _db():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


def test_single_decision_attributes_unambiguously():
    assert relate_node_to_decisions("totally unrelated text", ["Adopt Postgres"]) == [0]


def test_zero_overlap_creates_no_edge():
    decisions = ["Adopt Postgres database", "Use React frontend"]
    assert relate_node_to_decisions("hire a marketing intern", decisions) == []


def test_multi_decision_links_only_most_related():
    decs = ["Adopt Postgres for the database", "Use React for the frontend"]
    assert relate_node_to_decisions("Postgres handles concurrent writers", decs) == [0]
    assert relate_node_to_decisions("React component re-render memoization", decs) == [1]


def test_build_graph_is_not_a_cross_product():
    db = _db()
    ir = {
        "FACT": ["Postgres handles concurrent writers", "React re-renders need memoization"],
        "DECISION": ["Adopt Postgres for storage", "Use React for the frontend"],
        "CONFLICT": ["Postgres adds operational overhead however"],
    }
    build_graph_from_ir(db, "c", "s", ir, node_confidence=0.5)
    edges = db.query(KnowledgeEdge).all()
    assert len(edges) == 3, "cross-product would be 6"
    nodes = {n.id: n for n in db.query(KnowledgeNode).all()}
    for e in edges:
        src, dst = nodes[e.from_node_id].content.lower(), nodes[e.to_node_id].content.lower()
        if "postgres" in src:
            assert "postgres" in dst
        if "react" in src and "render" in src:
            assert "react" in dst


def test_kg_excludes_summary_and_confidence():
    db = _db()
    ir = {"SUMMARY": ["a prose summary"], "CONFIDENCE": ["Measured agreement: 42%"],
          "FACT": ["a fact"], "DECISION": ["a decision"]}
    build_graph_from_ir(db, "c2", "s2", ir, node_confidence=0.5)
    secs = {n.section for n in db.query(KnowledgeNode).all()}
    assert "SUMMARY" not in secs and "CONFIDENCE" not in secs
    assert "FACT" in secs and "DECISION" in secs
    assert KG_EXCLUDED_SECTIONS == {"SUMMARY", "CONFIDENCE"}


def test_decision_trace_groups_only_linked_evidence():
    db = _db()
    ir = {"FACT": ["Postgres handles concurrent writers safely"],
          "DECISION": ["Adopt Postgres for storage", "Use Kafka for the event bus"],
          "UNKNOWN": ["Kafka operational complexity is unproven for our team"]}
    build_graph_from_ir(db, "c3", "s3", ir, node_confidence=0.7)
    trace = get_decision_trace(db, "c3")
    pg = next(t for t in trace if "Postgres" in t["decision"])
    assert pg["n_links"] >= 1
    assert all("postgres" in l["content"].lower() for l in pg["links"])
    # The shared terms make each link auditable.
    assert any("postgres" in l["shared_terms"] for l in pg["links"])
