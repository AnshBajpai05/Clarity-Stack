Love it — let’s treat today like a **focused sprint** 👯‍♂️
Here’s a **clear, prioritized TODO plan** — grouped so you always work on the highest-impact + lowest-risk item first.

I’ll keep it practical, outcome-driven, and bite-sized.

---

# 🥇 Priority 1 — Stability of Core Loop (ABSOLUTE MUST)

Goal: **Chat → Messages → Context Banner always works + survives refresh**

| Status | Task                                                           | Why                             |
| ------ | -------------------------------------------------------------- | ------------------------------- |
| ⏳      | **Auto-refresh chat banner every 4–5s (like messages)**        | So edits reflect across clients |
| ⏳      | **Make sure `getChat(chatId)` is always the source of truth**  | Prevent stale banner            |
| ⏳      | **Gracefully handle null fields in banner UI**                 | Avoid ugly `undefined` values   |
| ⏳      | **Protect PATCH /chats/{id} so only allowed fields update**    | Avoid accidental breakage       |
| ⏳      | **Show toast on save + fail (you already started this 👍)**    | UX confidence                   |
| ⏳      | **Don’t throw UI errors when banner fails — just log + retry** | Production-style stability      |

✔️ Once these are done → **banner UX = stable + predictable.**

---

# 🥈 Priority 2 — Messaging UX Stability (Zero “WTF” Moments)

Goal: **Sending + receiving messages must feel smooth + correct.**

| Status | Task                                                 | Why                    |
| ------ | ---------------------------------------------------- | ---------------------- |
| ⏳      | Disable send button while `isSending`                | Prevent double-send    |
| ⏳      | Keep scroll pinned only if user is near bottom       | Respect user scrolling |
| ⏳      | Highlight synthesis reply slightly                   | UX clarity             |
| ⏳      | Show small loader inside input when sending          | Feels responsive       |
| ⏳      | Retry polling if it fails                            | Networking resilience  |
| ⏳      | Tag user messages with sender default (e.g., “User”) | Cleaner data           |

Optional (nice touch later):

| Task                                      | Why         |
| ----------------------------------------- | ----------- |
| Remember last sender name in localStorage | Save typing |

---

# 🥉 Priority 3 — Project + Chat Banner Consistency

Goal: **Project banner & Chat banner feel like one system.**

| Status | Task                                    | Why               |
| ------ | --------------------------------------- | ----------------- |
| ⏳      | Mirror UI layout + tone between banners | Professional feel |
| ⏳      | Same edit modal UX for both             | Predictability    |
| ⏳      | Show `last updated` small timestamp     | Trust & auditing  |
| ⏳      | Owner avatar initials (optional later)  | Recognizable      |

---

# 🟦 Priority 4 — “Signal Engine” Quality Path

Goal: **Noise classification should be visible + understandable.**

| Status | Task                                                           | Why                    |
| ------ | -------------------------------------------------------------- | ---------------------- |
| ⏳      | Add subtle label on user message: `Signal: High/Med/Low/Noise` | Debugging & UX clarity |
| ⏳      | Add tooltip explaining meaning                                 | Transparency           |
| ⏳      | Show assistant “soft message filtered” only on Noise           | Confidence in feature  |
| ⏳      | Let users toggle classification view ON/OFF in settings        | Control                |

Later improvement idea:

* Color ring around bubble based on signal quality

---

# 🟧 Priority 5 — 🧠 Knowledge Layer Prep (Soon)

Goal: **Be ready for cards & summaries.**

| Task                                                  | Why                         |
| ----------------------------------------------------- | --------------------------- |
| Ensure messages table stores reply_group_id correctly | Foundation for AI selection |
| Ensure accepted flag works — and only one per group   | Needed soon                 |
| Add endpoint to fetch accepted replies only           | Used by summarizer          |

This is the **bridge to Day 5–7 features.**

---

# 🟪 Priority 6 — Dev Experience / Fit-and-Finish

These pay dividends daily:

| Task                                            | Why                   |
| ----------------------------------------------- | --------------------- |
| Add loading skeletons instead of spinners       | Feels premium         |
| Add global error boundary                       | Prevent white screens |
| Centralize API error toast handler              | Consistent UX         |
| Log ALL API calls in dev console (addon toggle) | Debug fast            |

---

# 🟩 Optional — If You Have Extra Juice Today 💪

| Bonus                                   | Why                   |
| --------------------------------------- | --------------------- |
| Add “create first chat” CTA empty state | Magical onboarding    |
| Add unread dot on chats list            | Real-feel product     |
| Add pinned chats section                | Priority chats up top |
| Add project filter/search bar           | Grows well            |

---

# 🚨 Dependencies & Sequence (Do It In This Order)

So you don’t step on yourself:

1️⃣ **Finish banner auto-refresh + stability**
2️⃣ **Finish chat creation (done 👍 but validate end-to-end)**
3️⃣ **Improve message send UX & polling reliability**
4️⃣ **Wire accepted reply flows cleanly**
5️⃣ **Add visual signal indicators**
6️⃣ **Polish banners**
7️⃣ **Add dev/debug tools**

---

# 🧭 Your Sprint Mission Statement (for Today)

> 🔥 “By the end of today, ClarityStack should feel stable, predictable, and polished in the core loop: create chat → add context → talk → classify → see banner reflecting reality live.”

That’s **exactly where real products start to shine.**

---

# 🤝 How I’ll Help You — Partner-Mode

Whenever you say:

> “help me wire X”

I’ll respond with:

✔️ backend snippet
✔️ frontend snippet
✔️ where to paste
✔️ why it works
✔️ test steps
✔️ rollback plan

No guessing. No UI anxiety. We’ll ship safely.

---

If you want, I can next:

✅ turn this into a **Notion-ready checklist**
or
✅ help you start with **Priority 1 — polling the banner safely**

Just tell me 👇
