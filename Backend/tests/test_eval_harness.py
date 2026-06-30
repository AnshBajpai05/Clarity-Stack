"""§ AI-eval — the golden-set extraction gate + proof the scorer actually discriminates.

Offline only: runs the real prune->parse pipeline, no model/network. This is the CI
gate on extraction/validation *quality* (not just "does it crash"). It fails if pruning,
parsing, or section handling regresses.
"""
import pytest

from eval.harness import run_offline, extract_offline
from eval.scoring import score_ir, score_section, ir_micro_average
from eval.golden import GOLDEN, CASES_BY_ID

# Quality floor. Labels currently match the pipeline exactly (F1 = 1.0); the gate sits
# just below so a single regressed bullet across the whole set trips CI.
GATE_F1 = 0.95


def test_golden_set_meets_quality_gate():
    result = run_offline()
    overall = result["overall"]
    assert overall["f1"] >= GATE_F1, (
        f"extraction quality regressed: F1={overall['f1']:.3f} "
        f"(tp={overall['tp']} fp={overall['fp']} fn={overall['fn']})"
    )


@pytest.mark.parametrize("case", GOLDEN, ids=lambda c: c.id)
def test_every_golden_case_individually_passes(case):
    scored = score_ir(extract_offline(case.raw), case.expected)
    assert scored["overall"]["f1"] >= 0.90, f"{case.id} regressed: {scored['overall']}"


# ---- the pipeline contracts the gate is protecting (specific, not aggregate) ----

def test_chatty_preamble_is_dropped_not_extracted():
    ir = extract_offline(CASES_BY_ID["chatty_preamble"].raw)
    flat = " ".join(b for bullets in ir.values() for b in bullets).lower()
    assert "sure" not in flat and "hope" not in flat


def test_unknown_headers_leave_no_section():
    ir = extract_offline(CASES_BY_ID["unknown_headers_dropped"].raw)
    assert "REASONING" not in ir and "NOTES" not in ir
    assert set(ir) == {"FACT", "DECISION"}


def test_none_placeholders_collapse_their_section_away():
    ir = extract_offline(CASES_BY_ID["none_placeholders_dropped"].raw)
    # CONFLICT/UNKNOWN held only 'None' -> they must not appear as empty knowledge.
    assert "CONFLICT" not in ir and "UNKNOWN" not in ir


def test_all_noise_yields_empty_ir():
    assert extract_offline(CASES_BY_ID["all_noise_empty_ir"].raw) == {}


# ---- the scorer must DISCRIMINATE, or the gate is theater ----

def test_scorer_penalizes_a_hallucinated_bullet():
    s = score_section(["real fact about postgres", "fabricated claim about kafka"],
                      ["real fact about postgres"])
    assert s["fp"] == 1 and s["precision"] < 1.0 and s["recall"] == 1.0


def test_scorer_penalizes_a_dropped_bullet():
    s = score_section(["real fact about postgres"],
                      ["real fact about postgres", "missed fact about backups"])
    assert s["fn"] == 1 and s["recall"] < 1.0 and s["precision"] == 1.0


def test_paraphrase_above_threshold_matches_below_does_not():
    # Heavy token overlap -> match; disjoint vocabulary -> no match.
    near = score_section(["postgres handles concurrent writers safely"],
                         ["postgres handles concurrent writers"])
    far = score_section(["postgres handles concurrent writers"],
                        ["redis evicts keys under memory pressure"])
    assert near["f1"] == 1.0
    assert far["tp"] == 0 and far["f1"] == 0.0


def test_hallucinated_section_is_pure_false_positive():
    scored = score_ir({"FACT": ["postgres handles writers"], "DECISION": ["invented decision claim"]},
                      {"FACT": ["postgres handles writers"]})
    assert scored["per_section"]["DECISION"]["fp"] == 1
    assert scored["overall"]["recall"] == 1.0 and scored["overall"]["precision"] < 1.0


def test_micro_average_pools_bullets_not_sections():
    per = {"FACT": {"tp": 3, "fp": 1, "fn": 0}, "DECISION": {"tp": 1, "fp": 0, "fn": 2}}
    avg = ir_micro_average(per)
    assert avg["tp"] == 4 and avg["fp"] == 1 and avg["fn"] == 2
    assert avg["precision"] == pytest.approx(4 / 5)
    assert avg["recall"] == pytest.approx(4 / 6)
