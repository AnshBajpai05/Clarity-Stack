"""§16.1/§16.7 — ensemble carries a non-Llama architecture, and ask_direct_answer
raises on failure instead of returning an error string. No network."""
import pytest

import providers as p


def test_ensemble_has_a_non_llama_member():
    # §16.1: an all-Llama ensemble lexically agrees regardless of truth, inflating the
    # measured-agreement signal. At least one member must be a different architecture.
    labels = [name for name, _ in p.EXTRACTION_ENSEMBLE]
    non_llama = [l for l in labels if "llama" not in l.lower()]
    assert non_llama, f"ensemble is all-Llama: {labels}"


def test_ask_direct_answer_raises_instead_of_returning_error_string(monkeypatch):
    # §16.7: a provider outage must surface as an exception (caller -> 503), never be
    # returned as text that the /ask fallback would persist as an accepted answer.
    def boom(**kwargs):
        raise RuntimeError("provider down")
    monkeypatch.setattr(p, "_generic_chat", boom)
    with pytest.raises(RuntimeError):
        p.ask_direct_answer("hello")
