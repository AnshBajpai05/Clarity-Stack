"""Unit tests for the synthesis IR validators + measured-confidence rewrite (§8.1/§10.3).

These are the fail-closed gate that stops malformed / hallucinated synthesis from
reaching the DB and KG. Pure functions — no DB, no network.
"""
import pytest

import synthesis_service as ss
from ir_schema import SYNTHESIS_IR


def _full_ir() -> str:
    """A well-formed synthesis IR with every section, in canonical order."""
    lines = []
    for sec in SYNTHESIS_IR:
        lines.append(f"{sec}:")
        lines.append("- something" if sec != "CONFLICT" else "- speed vs cost")
    return "\n".join(lines)


# ─────────────────────── validate_ir_structure ───────────────────────

def test_strict_accepts_full_canonical_ir():
    ok, errs = ss.validate_ir_structure(_full_ir(), require_all_sections=True)
    assert ok, errs


def test_subset_accepts_partial_in_order():
    text = "FACT:\n- a\nDECISION:\n- b"
    ok, errs = ss.validate_ir_structure(text, require_all_sections=False)
    assert ok, errs


def test_rejects_free_text_line():
    text = "FACT:\n- a\nthis is hallucinated prose"
    ok, errs = ss.validate_ir_structure(text, require_all_sections=False)
    assert not ok
    assert any("free text" in e.lower() for e in errs)


def test_rejects_bullet_outside_any_section():
    text = "- orphan bullet\nFACT:\n- a"
    ok, errs = ss.validate_ir_structure(text, require_all_sections=False)
    assert not ok


def test_rejects_duplicate_section_header():
    text = "FACT:\n- a\nFACT:\n- b"
    ok, errs = ss.validate_ir_structure(text, require_all_sections=False)
    assert not ok
    assert any("duplicate" in e.lower() for e in errs)


def test_subset_rejects_non_canonical_order():
    text = "DECISION:\n- a\nFACT:\n- b"   # DECISION must come after FACT
    ok, errs = ss.validate_ir_structure(text, require_all_sections=False)
    assert not ok
    assert any("order" in e.lower() for e in errs)


def test_strict_rejects_missing_sections():
    ok, errs = ss.validate_ir_structure("FACT:\n- a", require_all_sections=True)
    assert not ok


# ─────────────────────── validate_conflict_semantics ───────────────────────

def test_conflict_with_opposition_marker_ok():
    ok, errs = ss.validate_conflict_semantics("CONFLICT:\n- latency vs throughput")
    assert ok, errs


def test_conflict_without_opposition_rejected():
    ok, errs = ss.validate_conflict_semantics("CONFLICT:\n- we should use redis")
    assert not ok
    assert any("opposition" in e.lower() for e in errs)


# ─────────────────────── parse / prune / strip ───────────────────────

def test_parse_sections_collects_bullets():
    secs = ss.parse_sections("FACT:\n- one\n- two\nDECISION:\n- d")
    assert secs["FACT"] == ["- one", "- two"]
    assert secs["DECISION"] == ["- d"]


def test_strip_empty_sections_drops_empty():
    out = ss.strip_empty_sections("SUMMARY:\nFACT:\n- keep")
    assert "SUMMARY" not in out
    assert "FACT:" in out and "- keep" in out


def test_prune_keeps_only_known_sections():
    out = ss.prune_to_synthesis_ir("BOGUS:\n- nope\nFACT:\n- real")
    assert "BOGUS" not in out
    assert "- real" in out


# ─────────────────────── apply_measured_confidence ───────────────────────

def test_apply_measured_confidence_replaces_self_report():
    content = "SUMMARY:\n- s\nFACT:\n- f\nCONFIDENCE:\n- I am extremely confident"
    agreement = {"n_models": 3, "score": 0.5, "level": "medium",
                 "method": "lexical_jaccard@0.5",
                 "per_section": {"FACT": {"score": 0.5, "clusters": 2, "claims": 3}}}
    out = ss.apply_measured_confidence(content, agreement)
    assert "extremely confident" not in out          # self-report gone
    assert "Measured inter-model agreement" in out    # measured value present
    ok, errs = ss.validate_ir_structure(out, require_all_sections=False)
    assert ok, errs


def test_apply_measured_confidence_single_model_is_honest():
    content = "FACT:\n- f\nCONFIDENCE:\n- 99% sure"
    agreement = {"n_models": 1, "score": None, "level": "single_model",
                 "method": "lexical_jaccard@0.5", "per_section": {}}
    out = ss.apply_measured_confidence(content, agreement)
    assert "99% sure" not in out
    assert "unavailable" in out.lower()


# ─────────────────────── synthesize_content fail-closed gate ───────────────────────

def test_synthesize_content_passes_valid_ir(monkeypatch):
    valid = "SUMMARY:\n- merged\nFACT:\n- a fact\nCONFLICT:\n- speed vs cost"
    monkeypatch.setattr(ss, "ask_hf_synthesis", lambda blocks: valid)
    out = ss.synthesize_content(["block1", "block2"])
    assert "a fact" in out


def test_synthesize_content_raises_on_bad_conflict(monkeypatch):
    # §16.5/§17.2: a CONFLICT bullet with no opposition now raises a *recoverable*
    # ConflictGateError ("conflict_validation_failed") — distinct from structural
    # garbage — so /ask can offer an Ask-Anyway retry instead of 503-ing a valid answer.
    bad = "FACT:\n- a\nCONFLICT:\n- just a plain statement"
    monkeypatch.setattr(ss, "ask_hf_synthesis", lambda blocks: bad)
    with pytest.raises(ss.ConflictGateError) as e:
        ss.synthesize_content(["x"])
    assert "conflict_validation_failed" in str(e.value)


def test_ask_anyway_bypasses_conflict_gate(monkeypatch):
    # strict_conflict=False (the override) relaxes ONLY the conflict-semantics check.
    bad = "FACT:\n- a\nCONFLICT:\n- just a plain statement"
    monkeypatch.setattr(ss, "ask_hf_synthesis", lambda blocks: bad)
    out = ss.synthesize_content(["x"], strict_conflict=False)
    assert "FACT:" in out and "just a plain statement" in out


def test_structural_garbage_fails_closed_even_with_ask_anyway(monkeypatch):
    # Output with no known section survives prune as empty -> plain RuntimeError
    # ("synthesis_validation_failed"), NOT a recoverable ConflictGateError, regardless
    # of ask_anyway. Structural validation never relaxes.
    monkeypatch.setattr(ss, "ask_hf_synthesis", lambda blocks: "RANDOM:\n- not a real section")
    with pytest.raises(RuntimeError) as e:
        ss.synthesize_content(["x"], strict_conflict=False)
    assert "synthesis_validation_failed" in str(e.value)
    assert not isinstance(e.value, ss.ConflictGateError)
