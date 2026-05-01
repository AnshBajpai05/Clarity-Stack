# ir_parser.py
from typing import Dict, List
import re

SECTION_HEADERS = [
    "FACT",
    "OPTION",
    "DECISION",
    "CONFLICT",
    "UNKNOWN",
    "ASSUMPTION"
]



from ir_schema import SYNTHESIS_IR

def parse_ir_from_synthesis(text: str) -> dict:
    sections = {sec: [] for sec in SYNTHESIS_IR}
    current = None

    for line in text.splitlines():
        line = line.strip()

        # Section header
        if line.endswith(":"):
            sec = line[:-1].strip().upper()
            if sec in sections:
                current = sec
            else:
                current = None
            continue

        # Bullet
        if current and line.startswith("-"):
            clean = line.lstrip("- ").strip()
            if clean and clean.lower() != "none":
                sections[current].append(clean)

    # Remove empty sections
    return {k: v for k, v in sections.items() if v}
