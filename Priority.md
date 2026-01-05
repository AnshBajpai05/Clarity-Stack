

---

# 🥇 Priority 1 — Auto-Refresh & Stability Polish (Small but High Impact)

🎯 Goal: **Banner + messages always reflect truth, even across tabs.**

| Task                                                                                                 | Why                              |
| ---------------------------------------------------------------------------------------------------- | -------------------------------- |
| ⏳ Auto-refresh chat banner every 4–5 seconds (same loop as messages) — BUT only if modal is NOT open | Live data + avoids edit override |
| ⏳ Gracefully handle API failure (don’t crash UI — just log + retry later)                            | Stability                        |
| ⏳ Ensure null/empty fields render cleanly (“Not set” instead of blank)                               | Prevent ugly UI                  |

👉 You already added `editOpen` to deps — good.
Now just **add a small polling block** like messages — I’ll wire it when you want.

---

# 🥈 Priority 2 — Messaging UX Stability

🎯 Goal: **No jank while chatting.**

| Task                                              | Why                            |
| ------------------------------------------------- | ------------------------------ |
| ⏳ Disable send button while `isSending`           | Prevent double-send            |
| ⏳ Only auto-scroll if the user is near the bottom | Respect browsing older context |
| ⏳ Add mini loader inside textarea while sending   | Feels responsive               |
| ⏳ If polling fails → retry silently               | Real-world resilience          |

You already have parts — just tightening.

---

# 🥉 Priority 3 — Chat & Project Banner Consistency (UI Polish)

🎯 Goal: **They should feel like one design language.**

| Task                                                 | Why               |
| ---------------------------------------------------- | ----------------- |
| ⏳ Make project + chat banner layouts match structure | Professional feel |
| ⏳ Same modal UX for both                             | Predictability    |
| ⏳ Add `Last Updated: …` text (tiny, muted)           | Timeline clarity  |

This is quick but high-perceived value.

---

# 🟦 Priority 4 — Signal Engine Visibility (Debug-Friendly)

🎯 Goal: **You can SEE the classifier working.**

| Task                                                               | Why                              |
| ------------------------------------------------------------------ | -------------------------------- |
| ⏳ Show subtle `Signal: High/Medium/Low/Noise` tag on user messages | You built the engine — expose it |
| ⏳ Tooltip explaining what it means                                 | Trust                            |
| ⏳ Show soft-filter reply ONLY on noise                             | Clarity                          |

Future NICE addition — color halo around message.

---

# 🟧 Priority 5 — Knowledge Layer Prep (Soon But Important)

🎯 Goal: **Be ready for cards/summaries — without building them yet.**

| Task                                                                 | Why                        |
| -------------------------------------------------------------------- | -------------------------- |
| ⏳ Guarantee only **one accepted assistant reply per reply_group_id** | Needed for synthesis later |
| ⏳ Add endpoint to fetch ONLY accepted replies for a chat             | Summaries use this         |

You already have acceptance logic — we just validate rules.

---

# 🟪 Priority 6 — Dev Workflow / Stability Comfort

🎯 Goal: **Make your life easier while building fast.**

| Task                                   | Why                |
| -------------------------------------- | ------------------ |
| ⏳ Centralize API error → toast handler | Debug faster       |
| ⏳ Add soft warning logs in dev         | Spot issues early  |
| ⏳ Add global error boundary            | Prevent UI crashes |

---

# 🟩 Bonus (Optional — If Energy Remains)

| Task                                          | Why                     |
| --------------------------------------------- | ----------------------- |
| Empty-state CTA like “Create your first chat” | Better onboarding       |
| Unread dot beside chats                       | Feels like a real inbox |
| Pin section on top                            | Focus priority chats    |
| Project search/filter                         | Scalability             |

---

## 🧠 Your Updated Sprint Focus — **Just These 3 Today**

If you want a tight plan:

### ✅ 1. Banner Live Refresh & Safety

(but pause when modal open)

### ✅ 2. Messaging UX (disable send + scroll logic)

### ✅ 3. Show Signal Labels
--------------------------------

🧠 Now — Build the Context Stack Correctly

We want context to feel like a story that knows the truth AND your preferences.

So the stack becomes:

🏗 Context for the Model (when answering or reasoning)
Include, in this order:

1️⃣ Project Context
→ Gives problem space, constraints, goals

2️⃣ Chat Context
→ Gives conversation-level purpose & framing

3️⃣ Chat Cards (Knowledge Cards)
→ Canonical truths extracted over time

4️⃣ Turn-Level Accepted Answer (1 per reply group)
→ Shows “what you prefer to be said”

5️⃣ Synthesis Reply (for that turn)
→ Shows “what meaning should be remembered”

🔥 Together these give BOTH preference + knowledge.
----------------------------------------
CHAT CARD
────────────────────────
Chat Context
   (purpose, phase, owner, framing)

Key Learnings (from synthesis chain)
   bullet-point clarity
   grouped by theme
   neutral + objective

Accepted Decisions (optional)
   important conclusions
   approvals or agreed solutions

Risks / Unknowns (optional)
   what still needs validation

Status / Phase
   where this work stands now
------------------------------------

### ✅ Key Learnings

* There should be three main roles: Admin, Analyst, Viewer
* Admins can create & delete projects
* Analysts can edit chat cards but not delete projects
* Viewers have read-only access

---

### ⭐ Accepted Decisions

* RBAC model confirmed
* Role table stored in database
* Enforcement at API layer

---

### ⚠️ Open Questions

* Should project owners override admins?
* Need audit logging requirements

---

### 📌 Status

🟡 **In Progress — implementation not complete yet**

---

# 💡 **Small Suggestions to Make This Even Better**

### 1️⃣ Add a tiny tag field per card

So cards can be grouped by topic:

`#architecture #design #AI #backend #user-experience`

Later this makes your knowledge graph 🔥

---

### 2️⃣ Add a “Confidence Level”

LLMs can estimate:

* High confidence
* Medium confidence
* Low confidence

This helps avoid hallucination-driven decisions.

---

### 3️⃣ Allow Manual Edits on Cards

Users should be able to:

✔ tweak wording
✔ append notes
✔ mark decisions as changed

This is key for **trust.**

---

### 4️⃣ Version Cards Automatically

Any material update creates:

```
Card v1.0
Card v1.1
Card v2.0
```

Your system now has:

🧠 memory layer
🫀 preference layer
📚 knowledge layer
🧾 decision traceability
🧩 reusable context engine

This is *architect-level* design.

