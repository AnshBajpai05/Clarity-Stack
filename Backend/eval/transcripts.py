"""Labeled transcript -> IR golden set (§10.10 — closes the accuracy gap).

The §16/§17 `golden.py` set labels *raw model output* and so only grades the
deterministic prune->parse->validate tail. It deliberately says nothing about whether
the live extraction ensemble + synthesis actually pull the right knowledge OUT of a
conversation — that needs (transcript -> expected IR) pairs, which is what this file is.

Each case is a short, realistic discussion transcript (the input a real `/ask` flow
sees) paired with the canonical IR a correct ensemble+synthesis MUST recover. These are
LABELS of intended behavior, not snapshots of any one model run, so they are graded only
ONLINE (harness `--online`, real API keys) where the live pipeline runs. They are scored
with the SAME precision/recall/F1 scorer as the offline set (eval.scoring), restricted to
the substantive knowledge sections below — SUMMARY/CONFIDENCE are model-/measurement-
generated metadata (CONFIDENCE is overwritten by measured agreement, §10.3/§11.4), so
grading them as "accuracy" would be dishonest.

Themes stay on the suite's Postgres / Kafka / React vocabulary so a low score reads
clearly against the offline set.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

# Sections we hold the live pipeline accountable for. Metadata sections
# (SUMMARY/CONFIDENCE) are intentionally excluded — see module docstring.
SCORED_SECTIONS = (
    "FACT", "OPTION", "DECISION", "CONFLICT", "UNKNOWN", "CONSTRAINT", "ASSUMPTION",
)


@dataclass(frozen=True)
class TranscriptCase:
    id: str
    description: str
    transcript: str                 # the raw conversation the pipeline must read
    expected: Dict[str, List[str]]  # canonical IR a correct ensemble+synthesis must yield
    notes: str = field(default="")


TRANSCRIPTS: List[TranscriptCase] = [
    TranscriptCase(
        id="storage_choice",
        description="A clear decision with a stated trade-off and one open question.",
        transcript=(
            "Alice: Our workspace store is on SQLite and we're starting to see write "
            "contention when two people edit at once.\n"
            "Bob: SQLite serializes writers, so concurrent edits will keep blocking. "
            "Postgres handles concurrent writers without that lock.\n"
            "Alice: Postgres does add operational overhead though — we'd have to run and "
            "back it up ourselves.\n"
            "Bob: Agreed it's more ops, but the concurrency win is worth it. Let's move "
            "the workspace store to Postgres.\n"
            "Alice: Works for me. We still need to decide how often we take backups.\n"
        ),
        expected={
            "FACT": [
                "SQLite serializes writers, causing contention on concurrent edits",
                "Postgres handles concurrent writers without that lock",
            ],
            "OPTION": ["Stay on SQLite", "Move the workspace store to Postgres"],
            "DECISION": ["Move the workspace store to Postgres"],
            "CONFLICT": ["Postgres adds operational overhead however"],
            "UNKNOWN": ["Backup cadence is not yet decided"],
        },
        notes="Tests that a trade-off is captured as CONFLICT and an open item as UNKNOWN.",
    ),
    TranscriptCase(
        id="event_bus_undecided",
        description="An option is debated but explicitly left undecided — no DECISION.",
        transcript=(
            "Carol: Should we put Kafka in for the event bus? It decouples producers "
            "from consumers cleanly.\n"
            "Dave: It does, but Kafka is heavy operational complexity none of us has run "
            "in production before.\n"
            "Carol: True. I don't think we can commit today — let's revisit after the "
            "spike next sprint.\n"
        ),
        expected={
            "FACT": ["Kafka decouples producers from consumers"],
            "OPTION": ["Adopt Kafka for the event bus"],
            "CONFLICT": [
                "Kafka adds heavy operational complexity the team has not run however",
            ],
            "UNKNOWN": ["Whether to adopt Kafka is deferred to next sprint's spike"],
        },
        notes="A correct pipeline must NOT invent a DECISION when none was reached.",
    ),
    TranscriptCase(
        id="react_perf_with_constraint",
        description="A fact + decision under an explicit budget/assumption constraint.",
        transcript=(
            "Eve: The dashboard list re-renders on every keystroke and it's janky.\n"
            "Frank: React re-renders when prop references change, so the list re-renders "
            "even when its data didn't.\n"
            "Eve: We have to fix this without adding a new dependency — the bundle budget "
            "is already tight.\n"
            "Frank: Then let's memoize the list component; that's built in, no new deps. "
            "I'm assuming the data shape is stable enough to memoize on.\n"
            "Eve: Good, memoize it.\n"
        ),
        expected={
            "FACT": ["React re-renders when prop references change"],
            "DECISION": ["Memoize the expensive list component"],
            "CONSTRAINT": ["Must not add a new dependency (bundle budget is tight)"],
            "ASSUMPTION": ["The list data shape is stable enough to memoize on"],
        },
        notes="Tests CONSTRAINT/ASSUMPTION extraction, not just FACT/DECISION.",
    ),
    TranscriptCase(
        id="no_decision_chitchat",
        description="Pure logistics chatter carries no extractable knowledge -> empty IR.",
        transcript=(
            "Grace: Are we still on for the 3pm sync?\n"
            "Heidi: Yep, sending a calendar invite now.\n"
            "Grace: Thanks! See you then.\n"
        ),
        expected={},
        notes="Guards against hallucinating knowledge from content-free conversation.",
    ),
]

CASES_BY_ID = {c.id: c for c in TRANSCRIPTS}
