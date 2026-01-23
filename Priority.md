Perfect. I’ll keep the **exact same structure, tone, and depth** — but updated to reflect reality:

* Phase-1: COMPLETED
* Phase-2: **Core DONE, only UI + refinement pending**
* Phase-3, Phase-4: As planned
* Extra remaining engineering items added at the **end as “Open Engineering TODOs”**

Here is the **final corrected `priority.md`** you can paste directly.

---

# 🧠 Project Roadmap — Current Execution Plan

> From raw chats → trusted synthesis → reasoning graph → long-term knowledge → context-aware intelligence.

---

# ✅ Phase 1 — Synthesis & IR (COMPLETED)

Goal: **Convert messy multi-model replies into clean, structured, validated meaning.**

Status: 🟢 **Done**

Completed components:

✔ IR schema (FACT, OPTION, DECISION, CONFLICT, UNKNOWN)
✔ Multi-model extraction
✔ Deterministic synthesis
✔ Structure validation
✔ Conflict detection
✔ UI role separation (assistant vs synthesis)
✔ Summary pinning logic
✔ Signal classification
✔ Acceptance system

This phase answers:

> “What does this conversation objectively mean?”

We now have a **clean semantic layer**.

---

# ⭐ Phase 2 — Knowledge Graph & Reasoning Layer (CORE COMPLETED)

Goal: **Turn synthesis into a connected belief system with support, conflict, and evolution.**

Status: 🟢 **Graph + Reasoning Logic Done**
Remaining: 🟡 **Visualization & Refinement Semantics**

---

## 🟢 P2.1 — Graph Schema (COMPLETED)

Core tables implemented:

### knowledge_nodes

Each bullet becomes a node:

* id
* type: FACT | DECISION | OPTION | CONFLICT | UNKNOWN
* content
* synthesis_id
* version
* confidence
* created_at

### knowledge_edges

Relations between beliefs:

* from_node_id
* to_node_id
* relation:

  * SUPPORTS
  * CONTRADICTS
  * REFINES
  * UPDATES
  * DEPENDS_ON
  * BLOCKS
  * ALTERNATIVE_OF
* created_at

This forms the **epistemic backbone**. ✔

---

## 🟢 P2.2 — Deterministic Relation Extraction (COMPLETED)

IR → Graph mapping implemented:

| IR Section   | Relation       | Target       |
| ------------ | -------------- | ------------ |
| FACT         | SUPPORTS       | DECISION     |
| CONFLICT     | CONTRADICTS    | DECISION     |
| OPTION       | ALTERNATIVE_OF | OPTION       |
| UNKNOWN      | BLOCKS         | DECISION     |
| New DECISION | REFINES        | Old DECISION |

Pure structural logic.
No LLM hallucination.
No heuristic guessing. ✔

---

## 🟢 P2.3 — Versioning & Belief Evolution (PARTIALLY ACTIVE)

Logical chain supported:

```
Decision v1
   ↓ REFINES
Decision v2
   ⚔ CONTRADICTS
Decision v3
```

Infrastructure exists:

✔ Version linking
✔ Decision lineage
✔ Historical edges

Refinement activation will become fully automatic once **context-chained replies** are enabled (e.g. `#continue`).

---

## 🟢 P2.4 — Reasoning Queries (COMPLETED)

Implemented and tested:

* What supports this decision?
* What contradicts it?
* What blocks it?
* What alternatives exist?
* What is unresolved?
* What is the current best decision?

System can now **reason over its own knowledge graph.** ✔

---

## 🟡 P2.5 — UI: Knowledge Graph Inspector (PENDING)

Enhance synthesis bubble:

```
[SYNTHESIS]
[Supported: 5] [Conflicts: 2] [Blocked: 1] [Alternatives: 3] [History]
```

Side panel:

```
This Decision
├── Supported by: 5 Facts
├── Conflicts: 2
├── Alternatives: 3
├── Blocked by: 1 Unknown
└── Version Chain: v1 → v2
```

Future (optional):

* Force-directed graph (Obsidian / Roam style)
* Node confidence shading
* Edge reasoning overlays

---

# ⭐ Phase 3 — Knowledge Cards (Next Layer)

Goal: **Freeze stable beliefs into editable, versioned, trusted units.**

Each synthesis becomes a card:

* Key Learnings
* Final Decisions
* Conflicts
* Open Questions
* Status (Draft / Locked / Deprecated)
* Confidence
* Tags
* Version History
* Knowledge Graph Links

This is your **long-term project memory layer**.

---

# ⭐ Phase 4 — Context Engine (Final Intelligence Layer)

Goal: **Make the model reason using the project’s actual knowledge state.**

Context stack:

1️⃣ Project Context
2️⃣ Relevant Knowledge Cards
3️⃣ Graph Relations (support / conflict / block / refine)
4️⃣ Latest Synthesis
5️⃣ Accepted Decisions
6️⃣ Current User Query

Now the system answers:

> “Given everything we *know and have decided*, what is correct now?”

---

# 🎯 Why This Order Is Architecturally Correct

Phase-1: Meaning extraction
Phase-2: Meaning relationships
Phase-3: Meaning persistence
Phase-4: Meaning reasoning

```
Chat → Synthesis → Graph → Cards → Context Brain
```

---

# ⏱ Time Reality (Updated)

| Phase               | Status | Time     |
| ------------------- | ------ | -------- |
| Phase-1 (Synthesis) | Done   | ✔        |
| Phase-2 (Graph)     | 85%    | 1 day UI |
| Phase-3 (Cards)     | Next   | 1–2 days |
| Phase-4 (Context)   | Next   | 1–2 days |

---

# 🧠 Cognitive Meaning of Each Phase

| Phase   | Cognitive Function   |
| ------- | -------------------- |
| Phase 1 | Understanding        |
| Phase 2 | Reasoning            |
| Phase 3 | Memory               |
| Phase 4 | Thinking with Memory |

---

# 🔧 Remaining Engineering TODOs (New Section)

These are not conceptual phases, but **practical completion tasks**:

### 🔹 Global vs Per-Project Graph Isolation

Decide:

* One global KG (cross-domain reasoning)
* Or project-scoped KG (clean separation)
* Or hybrid (local graphs + global meta-graph)

### 🔹 Context-Chained Replies (`#continue`)

Enable:

* Same `reply_group_id`
* Auto-REFINES edges
* Decision evolution tracking
* Temporal reasoning UI

### 🔹 Confidence & Trust Scores

Add:

* Node confidence
* Edge reliability
* Card trust level

### 🔹 Graph-Driven Card Builder

Auto-generate cards from:

* Stable decisions
* High-support facts
* Resolved conflicts

### 🔹 UI Shortcuts

Buttons for:

* “Refine Decision”
* “Mark Obsolete”
* “Lock Knowledge”
* “Create Card”

---

## Final Architectural Truth

Clarity Stack is no longer:

> A chat UI with memory.

It is becoming:

> A **cognitive system that understands, reasons, remembers, and evolves beliefs over time.**

And you are building it in the **correct order**.
