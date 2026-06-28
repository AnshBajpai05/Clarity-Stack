from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional, List
from models import Synthesis, gen_id, Message
from datetime import datetime, timezone

from providers import ask_hf_synthesis

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

def validate_ir_structure(text: str) -> (bool, List[str]):
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

    # Check exact section set
    if set(seen) != set(SECTIONS):
        errors.append(f"Section mismatch. Found {seen}, expected {SECTIONS}")

    # Check order
    if seen != SECTIONS:
        errors.append(f"Section order invalid. Found {seen}, expected {SECTIONS}")

    # Check duplicates
    if len(seen) != len(set(seen)):
        errors.append("Duplicate section headers found")

    return len(errors) == 0, errors

# =========================================================
# CONFLICT SEMANTIC VALIDATOR (PHASE 1 - LEVEL 2)
# =========================================================

CONFLICT_MARKERS = [" vs ", " but ", " however", " whereas", " while ", " on the other hand"]

def validate_conflict_semantics(text: str) -> (bool, List[str]):
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


SYNTHESIS_MODEL = "hf-qwen2.5-7b-synthesis"


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
def synthesize_content(assistant_replies: List[str]) -> str:
    """Blocking LLM merge + cleanup, with NO database access.

    §2.5: kept DB-free so it can be run via `asyncio.to_thread` from the async
    `/ask` handler — the event loop stays free during the (slow) synthesis call.
    """
    raw_merged = ask_hf_synthesis(assistant_replies)
    print("\n=== RAW SYNTHESIS FROM MODEL ===\n", raw_merged)

    # Optional light cleanup (keeps only known sections, but does NOT enforce structure)
    try:
        raw_merged = prune_to_synthesis_ir(raw_merged)
        print("\n=== AFTER PRUNE ===\n", raw_merged)
    except Exception:
        pass  # even if prune fails, still save raw

    return strip_empty_sections(raw_merged)


def build_kg_for_synthesis(db: Session, chat_id: str, synthesis_id: str, content: str) -> None:
    """Derived, rebuildable KG build for a *committed* synthesis row.

    §3.2: runs as a best-effort follow-on OUTSIDE the atomic conversation-graph
    transaction (the KG builder commits internally).
    """
    ir = parse_ir_from_synthesis(content)
    build_graph_from_ir(db, chat_id, synthesis_id, ir)


def generate_and_store_synthesis(
    db: Session,
    chat_id: str,
    reply_group_id: str,
    assistant_replies: List[str],
):
    """Synchronous convenience wrapper (LLM merge → persist + commit + KG).

    Used by the `/synthesis/generate` endpoint. The atomic `/ask` path instead
    calls `synthesize_content` + `save_or_update_synthesis(commit=False)` +
    `build_kg_for_synthesis` so it controls the transaction boundary itself.
    """
    final_clean = synthesize_content(assistant_replies)
    return save_or_update_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=reply_group_id,
        content=final_clean,
        model_used=SYNTHESIS_MODEL,
    )

