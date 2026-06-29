"""Unit tests for measured inter-model agreement (§10.3).

Pure logic — no DB, no network, no model calls — so this runs anywhere and is the
first real Backend test (addendum #1: automated tests were near-zero).
"""

from agreement import compute_agreement, confidence_bullets


def _block(**sections) -> str:
    """Build an IR block from {SECTION: [bullets]} for readable test fixtures."""
    out = []
    for sec, bullets in sections.items():
        out.append(f"{sec}:")
        out.extend(f"- {b}" for b in (bullets or ["None"]))
        out.append("")
    return "\n".join(out)


def test_full_agreement_all_models_same_fact():
    blocks = {
        "m1": _block(FACT=["The system uses PostgreSQL for storage"]),
        "m2": _block(FACT=["System uses PostgreSQL for storage layer"]),
        "m3": _block(FACT=["PostgreSQL is used by the system for storage"]),
    }
    res = compute_agreement(blocks)
    assert res["n_models"] == 3
    assert res["score"] == 1.0          # one cluster, supported by all 3 models
    assert res["level"] == "high"
    assert res["per_section"]["FACT"]["clusters"] == 1


def test_zero_agreement_disjoint_claims():
    blocks = {
        "m1": _block(FACT=["Authentication uses JWT tokens"]),
        "m2": _block(FACT=["Billing runs on monthly invoices"]),
        "m3": _block(FACT=["Frontend renders charts with d3"]),
    }
    res = compute_agreement(blocks)
    # three singleton clusters, each supported by exactly one model -> 0.0
    assert res["score"] == 0.0
    assert res["level"] == "low"
    assert res["per_section"]["FACT"]["clusters"] == 3


def test_partial_agreement_two_of_three():
    shared = "The database must support ACID transactions"
    blocks = {
        "m1": _block(CONSTRAINT=[shared]),
        "m2": _block(CONSTRAINT=["Database must support ACID transactions fully"]),
        "m3": _block(CONSTRAINT=["Latency should stay below 200 milliseconds"]),
    }
    res = compute_agreement(blocks)
    # clusters: {m1,m2} -> (2-1)/(3-1)=0.5 ; {m3} -> 0.0 ; mean = 0.25
    assert res["per_section"]["CONSTRAINT"]["clusters"] == 2
    assert res["score"] == 0.25
    assert res["level"] == "low"


def test_single_model_is_undefined_not_fabricated():
    res = compute_agreement({"m1": _block(FACT=["Only one model answered"])})
    assert res["n_models"] == 1
    assert res["score"] is None
    assert res["level"] == "single_model"
    bullets = confidence_bullets(res)
    assert any("unavailable" in b.lower() for b in bullets)


def test_no_comparable_claims_is_no_data():
    # SUMMARY is free prose and is never scored; CONFIDENCE is excluded by design.
    blocks = {
        "m1": _block(SUMMARY=["A long prose answer"], CONFIDENCE=["very confident"]),
        "m2": _block(SUMMARY=["A different prose answer"], CONFIDENCE=["highly confident"]),
    }
    res = compute_agreement(blocks)
    assert res["score"] is None
    assert res["level"] == "no_data"
    assert res["per_section"] == {}


def test_summary_and_confidence_excluded_from_scoring():
    blocks = {
        "m1": _block(FACT=["Shared fact about caching"], CONFIDENCE=["90% sure"]),
        "m2": _block(FACT=["Shared fact about caching layer"], CONFIDENCE=["10% sure"]),
    }
    res = compute_agreement(blocks)
    # only FACT contributes; the contradictory self-reported CONFIDENCE is ignored
    assert set(res["per_section"].keys()) == {"FACT"}
    assert res["score"] == 1.0


def test_confidence_bullets_are_honest_about_being_measured_and_lexical():
    blocks = {
        "m1": _block(FACT=["Shared fact one"]),
        "m2": _block(FACT=["Shared fact one indeed"]),
    }
    res = compute_agreement(blocks)
    text = " ".join(confidence_bullets(res)).lower()
    assert "measured" in text
    assert "lexical" in text
    assert "self-reported" in text   # explicitly states it is NOT used
