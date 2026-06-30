"""Devil's Advocate (§17.2) — red-team a committed decision.

Most AI tools rubber-stamp whatever they just produced. This one argues the OTHER
side: given a synthesis's DECISION (plus the supporting context from the same
analysis), it asks one model to surface the risks, the unstated assumptions, the
concrete failure modes, and the strongest counter-argument. The brainstorming value
is that it stress-tests a choice *before* you commit — shown in the same Decision
Cockpit that already reveals where the models agreed (Disagreement Spotlight) and why
the decision holds (KG trace).

Design notes:
  * No new column / migration: computed on demand from the stored synthesis content.
  * One model call, and only when the user asks (it costs) — the route rate-limits it.
  * Deterministic, dependency-free parsing of a tiny fixed header set, so the output
    is structured (categorised challenges) and the UI can colour each category.
  * No DECISION in the synthesis -> nothing to challenge -> a well-formed empty result
    WITHOUT spending a model call.
  * The underlying provider call RAISES on failure (providers.ask_devils_advocate), so
    we never fabricate or persist an error string as if it were a critique (§16.7).
"""
from typing import Dict, List

from ir_parser import parse_ir_from_synthesis
from providers import ask_devils_advocate, DEVILS_ADVOCATE_MODEL_LABEL

# Headers the red-team model emits, in display order. Tiny + fixed => deterministic
# parsing and a stable, colour-codable UI.
CRITIQUE_SECTIONS = ["RISK", "ASSUMPTION", "FAILURE_MODE", "COUNTERPOINT"]

# Synthesis sections that give the critic enough context to argue against the decision.
_CONTEXT_SECTIONS = ["FACT", "CONSTRAINT", "ASSUMPTION", "OPTION", "CONFLICT", "UNKNOWN"]


def _build_prompt(ir: Dict[str, List[str]]) -> str:
    """Render the synthesis IR into a red-team prompt: the decision + its context."""
    lines = ["DECISION TO RED-TEAM:"]
    lines += [f"- {d}" for d in ir.get("DECISION", [])]

    ctx: List[str] = []
    for sec in _CONTEXT_SECTIONS:
        for bullet in ir.get(sec, []):
            ctx.append(f"- [{sec}] {bullet}")
    if ctx:
        lines.append("")
        lines.append("CONTEXT FROM THE SAME ANALYSIS (use it to find weaknesses):")
        lines += ctx
    return "\n".join(lines)


def parse_critique(text: str) -> List[dict]:
    """Parse the model's `HEADER:` + `- bullet` output into [{category, text}, ...].

    Standalone (mirrors the IR-parsing convention used across the codebase) so it is
    unit-testable without a model call. Unknown headers and free prose are dropped, so
    a chatty model that wraps the answer in commentary still yields clean challenges.
    """
    out: List[dict] = []
    current = None
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.endswith(":"):
            header = line[:-1].strip().upper()
            current = header if header in CRITIQUE_SECTIONS else None
            continue
        if current and line.startswith("-"):
            clean = line.lstrip("- ").strip()
            if clean and clean.lower() != "none":
                out.append({"category": current, "text": clean})
    # Stable display order: group by section order, preserve in-section order.
    order = {s: i for i, s in enumerate(CRITIQUE_SECTIONS)}
    out.sort(key=lambda c: order.get(c["category"], 99))
    return out


def generate_devils_advocate(content: str) -> dict:
    """Red-team a synthesis.

    Returns {decision[], challenges[], model, n_challenges, note?}. With no DECISION
    there is nothing to challenge -> an empty, well-formed result and NO model call.
    May raise if the model call fails (caller surfaces a 503) — we never invent a
    critique.
    """
    ir = parse_ir_from_synthesis(content)
    decision = ir.get("DECISION", [])
    if not decision:
        return {
            "decision": [],
            "challenges": [],
            "model": None,
            "n_challenges": 0,
            "note": "no_decision",
        }

    raw = ask_devils_advocate(_build_prompt(ir))
    challenges = parse_critique(raw)
    return {
        "decision": decision,
        "challenges": challenges,
        "model": DEVILS_ADVOCATE_MODEL_LABEL,
        "n_challenges": len(challenges),
        # The model returned prose we couldn't structure — be honest rather than blank.
        "note": None if challenges else "unstructured_response",
    }
