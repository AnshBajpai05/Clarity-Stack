"""§18.1 — near-duplicate claim collapse (cockpit redundancy fix).

Fixtures are the REAL paraphrase triple from the Decision Cockpit screenshot that
motivated this: three models phrased one decision three ways and the cockpit rendered
three identical panels with 17/17 contested claims. Pure logic + in-memory SQLite.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models  # noqa: F401
from models import Base, KnowledgeNode, KnowledgeEdge
from claim_similarity import stem, claim_tokens, similarity, cluster_texts, dedupe_texts
from knowledge_graph_builder import build_graph_from_ir, gen_id, now
from reasoning_queries import get_decision_trace
from agreement import compute_agreement, contested_claims

# The exact three phrasings of ONE decision from the cockpit screenshot.
DECISION_A = ("The team has decided to adopt a gradual improvement approach, focusing on "
              "addressing weak areas and irregularities while maintaining the current workflow.")
DECISION_B = ("The decision to continue with the current workflow for now while gradually "
              "improving weak areas is based on a thorough evaluation of the potential risks "
              "and benefits.")
DECISION_C = "The team has decided to continue with the current workflow while making gradual improvements."

ASSUME_1 = ("It is assumed that gradual improvements and additional testing will be sufficient "
            "to address the identified weaknesses and irregularities in the workflow.")
ASSUME_2 = "The team assumes that gradual improvements will be sufficient to address the identified risks and abnormalities."


def _db():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


def test_stem_unifies_inflections():
    assert stem("improvements") == stem("improvement") == stem("improving")
    assert stem("gradually") == stem("gradual")
    assert stem("risks") == stem("risk")
    assert stem("irregularities") == stem("irregularity")


def test_screenshot_decision_triple_is_one_claim():
    clusters = cluster_texts([DECISION_A, DECISION_B, DECISION_C])
    assert len(clusters) == 1, f"expected one cluster, got {clusters}"
    # Representative is the shortest phrasing.
    keep = dedupe_texts([DECISION_A, DECISION_B, DECISION_C])
    assert keep == [2]


def test_paraphrased_assumptions_merge_but_distinct_topics_do_not():
    assert len(cluster_texts([ASSUME_1, ASSUME_2])) == 1
    distinct = [
        "Authentication uses JWT tokens",
        "Billing runs on monthly invoices",
        "Frontend renders charts with d3",
    ]
    assert len(cluster_texts(distinct)) == 3
    # Sanity: unrelated pairs stay far below threshold.
    assert similarity(claim_tokens(distinct[0]), claim_tokens(distinct[1])) < 0.2


def test_build_graph_dedupes_paraphrased_decisions():
    db = _db()
    ir = {
        "DECISION": [DECISION_A, DECISION_B, DECISION_C],
        "ASSUMPTION": [ASSUME_1, ASSUME_2],
        "FACT": ["The current workflow relies heavily on manual processes."],
    }
    build_graph_from_ir(db, "c", "s", ir, node_confidence=0.6)
    decisions = db.query(KnowledgeNode).filter_by(section="DECISION").all()
    assumptions = db.query(KnowledgeNode).filter_by(section="ASSUMPTION").all()
    assert len(decisions) == 1, [d.content for d in decisions]
    assert len(assumptions) == 1
    assert decisions[0].content == DECISION_C  # shortest phrasing kept


def test_decision_trace_merges_legacy_duplicate_nodes():
    """Data stored BEFORE write-time dedupe (three nodes for one decision) must still
    collapse to one trace entry with a deduped, unioned link set."""
    db = _db()
    d_ids = []
    for text in (DECISION_A, DECISION_B, DECISION_C):
        n = KnowledgeNode(id=gen_id(), chat_id="c9", synthesis_id="s9", section="DECISION",
                          content=text, version=1, confidence=None, created_at=now())
        db.add(n)
        d_ids.append(n.id)
    # Both paraphrased assumptions, each wired to every decision variant (the legacy mess).
    for text in (ASSUME_1, ASSUME_2):
        a = KnowledgeNode(id=gen_id(), chat_id="c9", synthesis_id="s9", section="ASSUMPTION",
                          content=text, version=1, confidence=None, created_at=now())
        db.add(a)
        for did in d_ids:
            db.add(KnowledgeEdge(id=gen_id(), chat_id="c9", from_node_id=a.id,
                                 to_node_id=did, relation="DEPENDS_ON", created_at=now()))
    db.commit()

    trace = get_decision_trace(db, "c9")
    assert len(trace) == 1, [t["decision"] for t in trace]
    t = trace[0]
    assert t["n_variants"] == 3
    assert set(t["variant_ids"]) == set(d_ids)
    # 2 paraphrased assumptions x 3 variants = 6 raw links -> exactly 1 after dedupe.
    assert t["n_links"] == 1
    assert t["links"][0]["relation"] == "DEPENDS_ON"


def test_agreement_sees_paraphrases_as_the_same_claim():
    blocks = {
        "gemini": f"DECISION:\n- {DECISION_A}\n",
        "groq": f"DECISION:\n- {DECISION_B}\n",
        "llama": f"DECISION:\n- {DECISION_C}\n",
    }
    res = compute_agreement(blocks)
    assert res["per_section"]["DECISION"]["clusters"] == 1
    assert res["score"] == 1.0
    assert contested_claims(blocks) == []
