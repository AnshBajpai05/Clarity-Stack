# Clarity Stack — Phase 1 & Phase 2 Technical README

This document explains **what problems we faced**, **why they occurred**, and **exactly how they were fixed** while building the Clarity Stack reasoning backend.

---

## 1. Goal of the System

Clarity Stack is a structured reasoning engine that converts unstructured LLM answers into:

* Canonical IR (FACT / OPTION / DECISION / CONFLICT / UNKNOWN)
* A persistent Knowledge Graph
* Explainable decision reasoning (support, conflict, blockers, alternatives)
* Future-ready temporal refinement (REFINES edges)

The objective is to make LLM reasoning:

* Inspectable
* Auditable
* Evolvable over time

---

## 2. Phase-1: Canonical Synthesis & IR Validation

### Problem 1: LLM Output Was Structurally Inconsistent

Different answers used different formats, mixed bullets, missing sections, wrong order.

### Fix

We enforced a **hard IR schema**:

```
FACT:
OPTION:
DECISION:
CONFLICT:
UNKNOWN:
```

Implemented:

* `prune_to_synthesis_ir()` – keeps only allowed sections
* `strip_empty_sections()` – removes empty ones
* `validate_ir_structure()` – ensures order, completeness, no free text
* `validate_conflict_semantics()` – ensures true contradiction markers

Result: Every synthesis becomes machine-parsable and deterministic.

---

## 3. Phase-2: Knowledge Graph Construction

### Problem 2: No Logical Relations Between Facts and Decisions

Initially facts, options, conflicts were stored as flat text. No structure meant:

* No reasoning
* No explainability
* No traversal

### Fix

We introduced a Knowledge Graph with:

### Node Types

| Section  | Node Type        |
| -------- | ---------------- |
| FACT     | Evidence         |
| OPTION   | Alternative      |
| DECISION | Conclusion       |
| CONFLICT | Counter-Evidence |
| UNKNOWN  | Uncertainty      |

### Edge Semantics

| From     | To       | Relation       |
| -------- | -------- | -------------- |
| FACT     | DECISION | SUPPORTS       |
| OPTION   | DECISION | ALTERNATIVE_OF |
| CONFLICT | DECISION | CONTRADICTS    |
| UNKNOWN  | DECISION | BLOCKS         |

Implemented in `build_graph_from_ir()`

---

## 4. Major Bugs Faced & Fixes

### Issue 1: Nodes Created But No Edges

Cause: IR parser returned bullets with '-' included; edge builder failed to detect sections.

Fix: Normalized IR parser to return clean bullet text and ensured section mapping.

---

### Issue 2: Duplicate & Cross-Chat Edges

Graph was connecting decisions from different chats because:

* No chat-level isolation
* Edges linked globally

Fix:

* All nodes now scoped by `synthesis_id`
* Reasoning queries filter by current synthesis only

---

### Issue 3: Edges Accumulating Without Cleanup

Every new synthesis appended edges, causing reasoning to show historical noise.

Fix:

* Graph is rebuilt per synthesis
* Reasoning always selects latest DECISION

---

### Issue 4: REFINES Always Empty

Cause: Refinement requires temporal continuity.
Currently each synthesis is independent.

Fix:

* Added hook `link_previous_decisions()`
* REFINES edges are reserved for Phase-3 (context-aware evolution)

System is now future-ready but not falsely hallucinating refinement.

---

### Issue 5: Reasoning Query Returning Empty Sets

Cause: Mismatch between edge direction and query direction.

Fix:

* Standardized: All relations point **towards DECISION**
* Reasoning queries fetch incoming edges by relation type

---

## 5. Reasoning Layer

Implemented `get_decision_explanation()` which returns:

* supports
* conflicts
* blockers
* alternatives
* refinements (future)

Tested using `test_reasoning.py` and verified logically correct outputs.

---

## 6. Architectural Guarantees After Phase-2

You now have:

1. Deterministic synthesis format
2. Graph-backed logical reasoning
3. Explainable decisions
4. Conflict and uncertainty awareness
5. Version-ready evolution hooks
6. Chat-scoped isolation

This is no longer a chatbot.
This is a **reasoning engine**.

---

## 7. Why This Matters

Most LLM systems:

* Generate text
* Forget structure
* Lose justification

Clarity Stack:

* Preserves epistemology
* Tracks why a decision exists
* Makes every conclusion auditable

---

## 8. Next Phase (UI)

UI will visualize:

* Decision center
* Evidence graph
* Conflict heatmap
* Uncertainty blockers
* Temporal refinement chains

But Phase-2 is now **architecturally complete and correct**.

---

End of Phase-1 & Phase-2 README
