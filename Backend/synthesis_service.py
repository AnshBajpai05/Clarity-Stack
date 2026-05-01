from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional, List
from models import Synthesis, gen_id
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
) -> Synthesis:

    existing = get_synthesis(db, chat_id, reply_group_id)
    if existing:
        old_id = existing.id

        existing.content = content
        existing.model_used = model_used
        existing.updated_at = now()
        db.commit()
        db.refresh(existing)

        ir = parse_ir_from_synthesis(existing.content)
        build_graph_from_ir(db, chat_id, existing.id, ir)   # ✅ FIXED

        link_previous_decisions(db, old_id, existing.id)
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
    db.commit()
    db.refresh(synth)

    ir = parse_ir_from_synthesis(synth.content)
    build_graph_from_ir(db, chat_id, synth.id, ir)   # ✅ FIXED

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


# =========================================================
# STABLE SYNTHESIS PIPELINE
# =========================================================
def generate_and_store_synthesis(
    db: Session,
    chat_id: str,
    reply_group_id: str,
    assistant_replies: List[str],
):

    raw_merged = ask_hf_synthesis(assistant_replies)
    print("\n=== RAW SYNTHESIS FROM MODEL ===\n", raw_merged)

    # Optional light cleanup (keeps only known sections, but does NOT enforce structure)
    try:
        raw_merged = prune_to_synthesis_ir(raw_merged)
        print("\n=== AFTER PRUNE ===\n", raw_merged)
    except Exception:
        pass  # even if prune fails, still save raw

    final_clean = strip_empty_sections(raw_merged)

    synth = save_or_update_synthesis(
        db=db,
        chat_id=chat_id,
        reply_group_id=reply_group_id,
        content=final_clean,
        model_used="hf-qwen2.5-7b-synthesis"
    )

    
    return synth

