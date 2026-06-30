from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional, List, Tuple
from models import Synthesis, gen_id, Message
from datetime import datetime, timezone

from providers import ask_hf_synthesis, SYNTHESIS_MODEL as SYNTHESIS_MODEL_ID

from agreement import confidence_bullets

from ir_schema import SYNTHESIS_IR as SECTIONS
def prune_to_synthesis_ir(text: str) -> str:
    allowed = set(SECTIONS)
    lines = text.splitlines()
    collected = {sec: [] for sec in SECTIONS}
    current = None

    for line in lines:
        line = line.strip()

        if line.endswith(":"):
            sec = line[:-1].strip().upper()
            current = sec if sec in allowed else None

        elif current and line:
            # normalize to bullet format
            collected[current].append(f"- {line.lstrip('- ').strip()}")

    output = []
    for sec in SECTIONS:
        if collected[sec]:                # only keep non-empty sections
            output.append(f"{sec}:")
            output.extend(collected[sec])
            output.append("")

    return "\n".join(output).strip()

def now():
    return datetime.now(timezone.utc)


# =========================================================
# CLEAN SECTION PARSER
# =========================================================

def parse_sections(text: str) -> dict:
    sections = {}
    current = None

    for line in text.splitlines():
        line = line.strip()

        if line in [f"{s}:" for s in SECTIONS]:
            current = line[:-1]
            sections[current] = []
        elif current and line.startswith("- "):
            sections[current].append(line)

    return sections


def strip_empty_sections(text: str) -> str:
    sections = parse_sections(text)
    output = []

    for sec in SECTIONS:
        bullets = sections.get(sec, [])
        if bullets:
            output.append(f"{sec}:")
            output.extend(bullets)
            output.append("")

    return "\n".join(output).strip()


# =========================================================
# DB HELPERS
# =========================================================

def get_synthesis(db: Session, chat_id: str, reply_group_id: str) -> Optional[Synthesis]:
    stmt = select(Synthesis).where(
        Synthesis.chat_id == chat_id,
        Synthesis.reply_group_id == reply_group_id
    )
    return db.scalars(stmt).first()


def list_synthesis_for_chat(db: Session, chat_id: str) -> List[Synthesis]:
    stmt = select(Synthesis).where(
        Synthesis.chat_id == chat_id
    ).order_by(Synthesis.created_at.desc())

    return list(db.scalars(stmt))

from models import KnowledgeNode  # add this import at top



from knowledge_graph_builder import build_graph_from_ir, link_previous_decisions
from ir_parser import parse_ir_from_synthesis  # or whatever function gives you IR dict


def save_or_update_synthesis(
    db: Session,
    chat_id: str,
    reply_group_id: str,
    content: str,
    model_used: Optional[str] = None,
    *,
    commit: bool = True,
    build_kg: bool = True,
) -> Synthesis:
    """Upsert the Synthesis row.

    §3.2: `commit=False` flushes (so the caller gets `synth.id`) but leaves the
    commit to the caller, letting the whole AI unit (provider messages + synthesis
    row + synthesis message) commit atomically. `build_kg=False` skips the derived
    KG build so it can run as a best-effort follow-on *after* that commit (the KG
    builder commits internally, which would otherwise break atomicity).
    """
    existing = get_synthesis(db, chat_id, reply_group_id)
    if existing:
        old_id = existing.id

        existing.content = content
        existing.model_used = model_used
        existing.updated_at = now()
        if commit:
            db.commit()
            db.refresh(existing)
        else:
            db.flush()

        if build_kg:
            ir = parse_ir_from_synthesis(existing.content)
            build_graph_from_ir(db, chat_id, existing.id, ir)
            link_previous_decisions(db, chat_id, old_id, existing.id)  # FIX: chat_id was missing
        return existing

    synth = Synthesis(
        id=gen_id(),
        chat_id=chat_id,
        reply_group_id=reply_group_id,
        content=content,
        model_used=model_used,
        created_at=now(),
        updated_at=now(),
    )

    db.add(synth)
    if commit:
        db.commit()
        db.refresh(synth)
    else:
        db.flush()

    if build_kg:
        ir = parse_ir_from_synthesis(synth.content)
        build_graph_from_ir(db, chat_id, synth.id, ir)

    return synth


# =========================================================
# HARD IR STRUCTURE VALIDATOR (PHASE 1 - LEVEL 1)
# =========================================================

def validate_ir_structure(text: str, *, require_all_sections: bool = True) -> Tuple[bool, List[str]]:
    """Structural gate for synthesis IR.

    Common invariants (always enforced): every non-blank line is either a known
    section header (`SECTION:`) or a `- ` bullet under one — no hallucinated free
    text — and no section header repeats.

    `require_all_sections=True` (default, strict): the section set/order must match
    SECTIONS exactly. `require_all_sections=False` (subset mode, used by the live
    synthesis gate): the pipeline drops *empty* sections, so we only require that
    the sections that ARE present are known, non-empty, and appear in canonical
    relative order — dropping an empty section is legal, hallucinating one isn't.
    """
    errors = []
    seen = []
    current = None

    lines = [l.rstrip() for l in text.splitlines() if l.strip()]

    for line in lines:
        if line.endswith(":") and line[:-1] in SECTIONS:
            sec = line[:-1]
            seen.append(sec)
            current = sec
        elif line.startswith("- "):
            if not current:
                errors.append("Bullet found outside any section")
        else:
            errors.append(f"Invalid free text line: '{line}'")

    if require_all_sections:
        # Check exact section set
        if set(seen) != set(SECTIONS):
            errors.append(f"Section mismatch. Found {seen}, expected {SECTIONS}")

        # Check order
        if seen != SECTIONS:
            errors.append(f"Section order invalid. Found {seen}, expected {SECTIONS}")
    else:
        # Subset mode: at least one known section, all known, in canonical order.
        if not seen:
            errors.append("No known sections found")
        canonical = [s for s in SECTIONS if s in seen]
        deduped = []
        for s in seen:
            if s not in deduped:
                deduped.append(s)
        if deduped != canonical:
            errors.append(
                f"Section order invalid. Found {seen}, expected canonical order {canonical}"
            )

    # Check duplicates (both modes)
    if len(seen) != len(set(seen)):
        errors.append("Duplicate section headers found")

    return len(errors) == 0, errors

# =========================================================
# CONFLICT SEMANTIC VALIDATOR (PHASE 1 - LEVEL 2)
# =========================================================

CONFLICT_MARKERS = [" vs ", " but ", " however", " whereas", " while ", " on the other hand"]


class ConflictGateError(RuntimeError):
    """Raised when a synthesis is well-formed but its CONFLICT bullets don't lexically
    read as a real opposition (the §10.6 conflict-semantics gate).

    Distinct from a plain RuntimeError (structural garbage / provider outage) so the
    /ask path can tell the two apart: a structural failure is fail-closed (503), but a
    conflict-gate failure is RECOVERABLE — the answer may well be valid, the lexical
    marker check is just conservative (§16.5). Callers surface an "Ask Anyway" retry
    that re-runs with strict_conflict=False instead of 503-ing a good answer.
    """


def validate_conflict_semantics(text: str) -> Tuple[bool, List[str]]:
    errors = []
    sections = parse_sections(text)
    conflicts = sections.get("CONFLICT", [])

    for c in conflicts:
        line = c.lower()
        if not any(marker in line for marker in CONFLICT_MARKERS):
            errors.append(f"Invalid conflict (no opposition detected): {c}")

    return len(errors) == 0, errors

def get_latest_synthesis(db: Session, chat_id: str, reply_group_id: str):
    stmt = select(Synthesis).where(
        Synthesis.chat_id == chat_id,
        Synthesis.reply_group_id == reply_group_id
    ).order_by(Synthesis.created_at.desc())
    return db.scalars(stmt).first()


# §11.5: record the REAL pinned model id on each synthesis row (the old
# "hf-qwen2.5-7b-synthesis" label was wrong — synthesis runs on Groq, see
# providers.SYNTHESIS_MODEL). Truthful provenance is what makes a run reproducible.
SYNTHESIS_MODEL = SYNTHESIS_MODEL_ID


# =========================================================
# SYNTHESIS MESSAGE FACTORY (§3.4)
# =========================================================
def build_synthesis_message(chat_id: str, reply_group_id: str, synth: Synthesis) -> Message:
    """Single source of truth for the chat-visible synthesis Message row.

    Both `/ask` and `/synthesis/generate` build the row here so its shape never
    diverges (role/type/synthesis_id/accepted/signal_level were previously set
    differently in the two paths — see existing_issues §3.4).
    """
    return Message(
        chat_id=chat_id,
        role="synthesis",
        sender="synthesis",
        type="synthesis",
        text=synth.content,
        reply_group_id=reply_group_id,
        synthesis_id=synth.id,
        include_in_summary=True,
        accepted=True,
        signal_level="high",
    )


# =========================================================
# STABLE SYNTHESIS PIPELINE
# =========================================================
def synthesize_content(assistant_replies: List[str], *, strict_conflict: bool = True) -> str:
    """Blocking LLM merge + cleanup, with NO database access.

    §2.5: kept DB-free so it can be run via `asyncio.to_thread` from the async
    `/ask` handler — the event loop stays free during the (slow) synthesis call.

    `strict_conflict=True` (default): an unconfirmed CONFLICT raises ConflictGateError
    so the caller can offer an "Ask Anyway" retry (§16.5). `strict_conflict=False`
    (the override): the conflict-semantics check is downgraded to a logged warning and
    the answer is returned — the user has explicitly accepted the weaker phrasing.
    Structural validation stays fail-closed in BOTH modes: garbage IR never persists.
    """
    raw_merged = ask_hf_synthesis(assistant_replies)
    print("\n=== RAW SYNTHESIS FROM MODEL ===\n", raw_merged)

    # Optional light cleanup (keeps only known sections, but does NOT enforce structure)
    try:
        raw_merged = prune_to_synthesis_ir(raw_merged)
        print("\n=== AFTER PRUNE ===\n", raw_merged)
    except Exception:
        pass  # even if prune fails, still save raw

    cleaned = strip_empty_sections(raw_merged)

    # §8.1 / §10.6: the "synthesis" is an LLM call (temperature 0, but still a model),
    # NOT a deterministic compiler merge. Before it reaches the DB/KG, enforce that
    # the output is well-formed IR — known sections only, canonical order, no
    # hallucinated free text — and that any CONFLICT bullets express real opposition.
    # Fail-closed: invalid synthesis raises, and both LLM callers (`/ask`,
    # `/synthesis/generate`) roll the unit back and surface a 503 instead of
    # persisting garbage. This makes the previously-dead validators the real gate.
    # Structural gate: fail-closed in every mode — hallucinated/garbled IR never persists.
    ok_struct, struct_errs = validate_ir_structure(cleaned, require_all_sections=False)
    if not ok_struct:
        print("\n=== SYNTHESIS STRUCTURE INVALID ===\n" + "\n".join(struct_errs))
        raise RuntimeError("synthesis_validation_failed: " + "; ".join(struct_errs))

    # Conflict-semantics gate: recoverable. The lexical marker check is conservative
    # and can flag a perfectly valid answer (§16.5), so it raises a DISTINCT error the
    # caller can offer to override — unless the caller already opted in (strict=False).
    ok_conflict, conflict_errs = validate_conflict_semantics(cleaned)
    if not ok_conflict:
        if strict_conflict:
            print("\n=== SYNTHESIS CONFLICT GATE TRIPPED ===\n" + "\n".join(conflict_errs))
            raise ConflictGateError("conflict_validation_failed: " + "; ".join(conflict_errs))
        print("\n=== CONFLICT GATE BYPASSED (ask_anyway) ===\n" + "\n".join(conflict_errs))

    return cleaned


def apply_measured_confidence(content: str, agreement: dict) -> str:
    """Overwrite the synthesis CONFIDENCE section with MEASURED inter-model agreement.

    §10.3 / §11.4: the LLM's self-reported confidence is discarded here and replaced
    with the agreement actually observed across the ensemble's independent answers
    (see agreement.compute_agreement). The section is rebuilt in canonical SYNTHESIS_IR
    order and re-validated (subset mode) so the persisted IR stays well-formed.

    Fail-safe: if the rebuilt IR somehow fails validation (it shouldn't — we control
    the format), we log and return the original `content` rather than dropping the
    whole synthesis. Truthful-but-degraded beats data loss.
    """
    sections = parse_sections(content)
    sections["CONFIDENCE"] = ["- " + b for b in confidence_bullets(agreement)]

    output = []
    for sec in SECTIONS:                     # canonical SYNTHESIS_IR order
        bullets = sections.get(sec, [])
        if bullets:
            output.append(f"{sec}:")
            output.extend(bullets)
            output.append("")
    rebuilt = "\n".join(output).strip()

    ok_struct, errs = validate_ir_structure(rebuilt, require_all_sections=False)
    if not ok_struct:
        print("[synthesis] measured-confidence rewrite failed validation, keeping "
              "original: " + "; ".join(errs))
        return content
    return rebuilt


def build_kg_for_synthesis(db: Session, chat_id: str, synthesis_id: str, content: str,
                           node_confidence: float = None) -> None:
    """Derived, rebuildable KG build for a *committed* synthesis row.

    §3.2: runs as a best-effort follow-on OUTSIDE the atomic conversation-graph
    transaction (the KG builder commits internally). §10.3: `node_confidence` carries
    the measured inter-model agreement score onto each node.
    """
    ir = parse_ir_from_synthesis(content)
    build_graph_from_ir(db, chat_id, synthesis_id, ir, node_confidence=node_confidence)


def generate_and_store_synthesis(
    db: Session,
    chat_id: str,
    reply_group_id: str,
    assistant_replies: List[str],
    *,
    strict_conflict: bool = True,
):
    """Synchronous convenience wrapper (LLM merge → persist + commit + KG).

    Used by the `/synthesis/generate` endpoint. The atomic `/ask` path instead
    calls `synthesize_content` + `save_or_update_synthesis(commit=False)` +
    `build_kg_for_synthesis` so it controls the transaction boundary itself.

    `strict_conflict=False` is the Ask-Anyway override (§16.5): it relaxes the
    recoverable conflict-semantics gate while keeping structural validation strict.
    """
    final_clean = synthesize_content(assistant_replies, strict_conflict=strict_conflict)
    return save_or_update_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=reply_group_id,
        content=final_clean,
        model_used=SYNTHESIS_MODEL,
    )

