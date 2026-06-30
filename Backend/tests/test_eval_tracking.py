"""§10.10 experiment tracking — persist runs + compare against the prior one.

Pure/offline: writes records to a tmp EVAL_RUNS_DIR and asserts roundtrip + that the
comparison detects regression vs improvement. No network.
"""
import pytest

from eval import tracking


@pytest.fixture(autouse=True)
def _tmp_runs(tmp_path, monkeypatch):
    monkeypatch.setenv("EVAL_RUNS_DIR", str(tmp_path / "runs"))
    yield


def _result(tp, fp, fn, sections=None):
    p = 1.0 if (tp + fp) == 0 else tp / (tp + fp)
    r = 1.0 if (tp + fn) == 0 else tp / (tp + fn)
    f1 = 0.0 if (p + r) == 0 else 2 * p * r / (p + r)
    return {
        "rows": [{"id": "c1"}],
        "overall": {"tp": tp, "fp": fp, "fn": fn, "precision": p, "recall": r, "f1": f1},
        "section_totals": sections or {"FACT": {"tp": tp, "fp": fp, "fn": fn}},
    }


def test_record_then_load_roundtrip_with_metadata():
    path = tracking.record_run(_result(10, 0, 0), kind="offline")
    assert path.exists()
    runs = tracking.load_runs(kind="offline")
    assert len(runs) == 1
    rec = runs[0]
    assert rec["kind"] == "offline"
    assert rec["overall"]["f1"] == 1.0
    assert rec["n_cases"] == 1
    assert "ts" in rec and "models" in rec  # metadata stamped (git_commit may be None)


def test_load_filters_by_kind():
    tracking.record_run(_result(5, 0, 0), kind="offline")
    tracking.record_run(_result(3, 0, 0), kind="online_accuracy")
    assert len(tracking.load_runs(kind="offline")) == 1
    assert len(tracking.load_runs()) == 2


def test_compare_flags_regression():
    prev = tracking.load_runs  # noqa: F841 (clarity: we build records directly below)
    curr = {"overall": {"f1": 0.8, "precision": 0.8, "recall": 0.8},
            "section_totals": {"FACT": {"tp": 8, "fp": 2, "fn": 2}}, "git_commit": "new"}
    base = {"overall": {"f1": 0.95, "precision": 0.95, "recall": 0.95},
            "section_totals": {"FACT": {"tp": 19, "fp": 1, "fn": 0}}, "git_commit": "old"}
    cmp = tracking.compare(curr, base)
    assert cmp["regressed"] is True
    assert cmp["f1_delta"] < 0
    assert cmp["per_section_f1_delta"]["FACT"] < 0


def test_compare_flags_improvement_and_no_change():
    base = {"overall": {"f1": 0.8, "precision": 0.8, "recall": 0.8}, "section_totals": {}}
    better = {"overall": {"f1": 0.9, "precision": 0.9, "recall": 0.9}, "section_totals": {}}
    up = tracking.compare(better, base)
    assert up["regressed"] is False and up["f1_delta"] > 0

    same = tracking.compare(base, base)
    assert same["regressed"] is False and same["f1_delta"] == 0.0


def test_format_comparison_is_human_readable():
    cmp = tracking.compare(
        {"overall": {"f1": 0.7, "precision": 0.7, "recall": 0.7},
         "section_totals": {"FACT": {"tp": 7, "fp": 3, "fn": 0}}, "git_commit": "b"},
        {"overall": {"f1": 0.9, "precision": 0.9, "recall": 0.9},
         "section_totals": {"FACT": {"tp": 9, "fp": 1, "fn": 0}}, "git_commit": "a"},
    )
    text = tracking.format_comparison(cmp)
    assert "REGRESSED" in text
    assert "FACT" in text
