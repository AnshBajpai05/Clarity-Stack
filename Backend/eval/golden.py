"""Golden evaluation set: raw model output -> expected canonical IR.

Each `raw` is a realistic (messy) extraction as a model actually emits it — chatty
preamble, unknown headers, stray prose, "None" placeholders, casing drift, duplicate
restatements. Each `expected` is the hand-labeled IR a correct prune->parse->validate
pipeline must yield. Themes are kept consistent with the rest of the suite
(Postgres / Kafka / React) so failures read clearly.

These are LABELS, not snapshots of current output: they encode the intended contract,
so a regression in pruning/parsing/validation makes the score drop.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class GoldenCase:
    id: str
    description: str
    raw: str                       # raw model output (pre-prune)
    expected: Dict[str, List[str]] # canonical IR a correct pipeline must produce


GOLDEN: List[GoldenCase] = [
    GoldenCase(
        id="clean_full",
        description="Well-formed output across all decision sections — identity transform.",
        raw=(
            "FACT:\n- Postgres handles concurrent writers safely\n"
            "OPTION:\n- Adopt Postgres\n- Stay on SQLite\n"
            "DECISION:\n- Adopt Postgres for workspace storage\n"
            "CONFLICT:\n- Postgres adds operational overhead however\n"
            "UNKNOWN:\n- Backup cadence is not yet decided\n"
        ),
        expected={
            "FACT": ["Postgres handles concurrent writers safely"],
            "OPTION": ["Adopt Postgres", "Stay on SQLite"],
            "DECISION": ["Adopt Postgres for workspace storage"],
            "CONFLICT": ["Postgres adds operational overhead however"],
            "UNKNOWN": ["Backup cadence is not yet decided"],
        },
    ),
    GoldenCase(
        id="chatty_preamble",
        description="Model prepends conversational filler before any header — must be dropped.",
        raw=(
            "Sure! Here is the structured breakdown you asked for:\n"
            "I hope this captures the discussion.\n"
            "FACT:\n- Kafka decouples producers from consumers\n"
            "DECISION:\n- Use Kafka for the event bus\n"
        ),
        expected={
            "FACT": ["Kafka decouples producers from consumers"],
            "DECISION": ["Use Kafka for the event bus"],
        },
    ),
    GoldenCase(
        id="unknown_headers_dropped",
        description="Headers outside the IR schema (REASONING/NOTES) and their bodies are dropped.",
        raw=(
            "REASONING:\n- because the team already knows it\n"
            "FACT:\n- React re-renders on new prop references\n"
            "NOTES:\n- ping the frontend channel\n"
            "DECISION:\n- Memoize the expensive list component\n"
        ),
        expected={
            "FACT": ["React re-renders on new prop references"],
            "DECISION": ["Memoize the expensive list component"],
        },
    ),
    GoldenCase(
        id="none_placeholders_dropped",
        description="'None' / 'none' placeholder bullets must not become knowledge.",
        raw=(
            "FACT:\n- The cluster has three nodes\n"
            "CONFLICT:\n- None\n"
            "UNKNOWN:\n- none\n"
            "DECISION:\n- Keep the three-node cluster\n"
        ),
        expected={
            "FACT": ["The cluster has three nodes"],
            "DECISION": ["Keep the three-node cluster"],
        },
    ),
    GoldenCase(
        id="casing_and_prose_lines",
        description="Lowercase header is normalized; un-dashed prose under a section is kept.",
        raw=(
            "fact:\n"
            "Redis is an in-memory store\n"          # prose, no dash -> still a fact bullet
            "- it evicts under memory pressure\n"
            "decision:\n- Use Redis for the hot cache\n"
        ),
        expected={
            "FACT": ["Redis is an in-memory store", "it evicts under memory pressure"],
            "DECISION": ["Use Redis for the hot cache"],
        },
    ),
    GoldenCase(
        id="metadata_sections_kept_in_ir",
        description="SUMMARY/CONFIDENCE are valid IR sections (KG excludes them later, IR keeps them).",
        raw=(
            "SUMMARY:\n- The team converged on Postgres\n"
            "FACT:\n- Postgres has mature tooling\n"
            "DECISION:\n- Adopt Postgres\n"
            "CONFIDENCE:\n- Measured agreement: 67%\n"
        ),
        expected={
            "SUMMARY": ["The team converged on Postgres"],
            "FACT": ["Postgres has mature tooling"],
            "DECISION": ["Adopt Postgres"],
            "CONFIDENCE": ["Measured agreement: 67%"],
        },
    ),
    GoldenCase(
        id="duplicate_restatement_lossless",
        description="IR is lossless — duplicate restatements are NOT deduped here (that is the KG/delta layer).",
        raw=(
            "FACT:\n- Postgres handles concurrent writers\n- Postgres handles concurrent writers\n"
            "DECISION:\n- Adopt Postgres\n"
        ),
        expected={
            "FACT": ["Postgres handles concurrent writers", "Postgres handles concurrent writers"],
            "DECISION": ["Adopt Postgres"],
        },
    ),
    GoldenCase(
        id="all_noise_empty_ir",
        description="No valid section at all -> empty IR, not a hallucinated section.",
        raw=(
            "Thanks for sharing! I do not have enough to structure this yet.\n"
            "Let me know if you want me to try again.\n"
        ),
        expected={},
    ),
    GoldenCase(
        id="constraints_and_assumptions",
        description="CONSTRAINT and ASSUMPTION sections are first-class and preserved.",
        raw=(
            "CONSTRAINT:\n- Must stay within the existing $0 infra budget\n"
            "ASSUMPTION:\n- The team can operate a managed Postgres instance\n"
            "DECISION:\n- Adopt a managed Postgres tier\n"
        ),
        expected={
            "CONSTRAINT": ["Must stay within the existing $0 infra budget"],
            "ASSUMPTION": ["The team can operate a managed Postgres instance"],
            "DECISION": ["Adopt a managed Postgres tier"],
        },
    ),
    GoldenCase(
        id="trailing_empty_and_spacing",
        description="Blank lines and trailing whitespace around bullets do not create empty bullets.",
        raw=(
            "FACT:\n\n-   Vector search needs an index   \n\n"
            "DECISION:\n- Add a pgvector index\n\n\n"
        ),
        expected={
            "FACT": ["Vector search needs an index"],
            "DECISION": ["Add a pgvector index"],
        },
    ),
]

CASES_BY_ID = {c.id: c for c in GOLDEN}
