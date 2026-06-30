"""§17.2 Devil's Advocate — red-team output parsing + prompt build. No model call."""
from devils_advocate import parse_critique, generate_devils_advocate, _build_prompt, CRITIQUE_SECTIONS


def test_parse_critique_isolates_categories_and_drops_noise():
    raw = (
        "RISK:\n- Single point of failure if the DB node dies.\n"
        "ASSUMPTION:\n- Assumes the team can run Postgres in prod.\n"
        "here is some chatty preamble the model added\n"
        "FAILURE_MODE:\n- Schema drifts silently under migration.\n"
        "COUNTERPOINT:\n- SQLite ships faster for a single-writer MVP.\n- None\n"
    )
    out = parse_critique(raw)
    assert [c["category"] for c in out] == CRITIQUE_SECTIONS
    assert len(out) == 4                                   # prose + "- None" dropped
    assert all(c["text"] and c["text"].lower() != "none" for c in out)


def test_no_decision_returns_empty_without_model_call():
    # No DECISION -> nothing to challenge; must NOT call the model (would need network).
    res = generate_devils_advocate("FACT:\n- just a fact\n")
    assert res["note"] == "no_decision"
    assert res["challenges"] == [] and res["n_challenges"] == 0


def test_build_prompt_includes_decision_and_context():
    p = _build_prompt({"DECISION": ["Adopt Postgres"], "FACT": ["handles writers"],
                       "CONFLICT": ["ops cost"]})
    assert "Adopt Postgres" in p and "[FACT]" in p and "[CONFLICT]" in p
