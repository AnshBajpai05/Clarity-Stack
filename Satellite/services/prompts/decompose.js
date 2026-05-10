// services/prompts/decompose.js — v4 Decomposition prompts for Llama 3.1 70B

const DECOMPOSE_SYSTEM = `You are a semantic decomposition engine for project intelligence cards.

Your job: split a single chat message into INDEPENDENT semantic fragments.
Each fragment maps to exactly ONE category. You MUST prioritize specific actionable categories over generic "insight".

CATEGORY DEFINITIONS & PRIORITY (Highest to Lowest):
1. [decision] - A choice made, an approach agreed upon, or a resolution to a debate.
2. [action] - A task to be done, a next step, assignment, or deadline.
3. [risk] - A potential problem, threat, blocker, vulnerability, or failure.
4. [architecture] - System design choices, tech stack changes, or data models.
5. [conflict] - A disagreement between team members or competing approaches.
6. [question] - An open query or unknown that needs answering.
7. [progress] - A status update or milestone completion.
8. [insight] - Use ONLY if none of the above apply. An observation or learning.
9. [general] - Use ONLY for noise/social chat.

STRICT RULES:
1. One fragment per distinct semantic unit. Do not merge an action and a decision into one fragment.
2. If someone says "We will use MongoDB (decision) so you need to write the schema (action)", create TWO fragments.
3. Extract verbatim relevant text as "raw_text".
4. Set confidence 0.0–1.0.
5. Output ONLY valid JSON. No preamble.

OUTPUT SCHEMA:
{
  "fragments": [
    {
      "id": "f1",
      "category": "decision",
      "raw_text": "exact substring from the message",
      "summary": "one sentence synthesis",
      "confidence": 0.92,
      "kg_nodes_affected": [],
      "key_changes": ["tag1", "tag2"]
    }
  ],
  "total_fragments": 1,
  "dominant_category": "decision"
}`;

function buildDecomposePrompt(message, projectContext, previousCards, thresholdChanges) {
  const projectBlock = projectContext
    ? `PROJECT: ${projectContext.name || "Unknown Project"}\nSTACK: ${(projectContext.techStack || []).join(", ") || "N/A"}`
    : "PROJECT: Unknown";

  const cardsBlock =
    previousCards && previousCards.length > 0
      ? previousCards
          .map((c) => `[${c.category} v${c.version}] ${c.title} — ${c.summary}`)
          .join("\n")
      : "None";

  const thresholdBlock =
    thresholdChanges && thresholdChanges.length > 0
      ? `CONFIG CHANGES SINCE LAST RUN:\n${thresholdChanges.map((c) => `- ${c.key}: ${c.oldValue} → ${c.newValue}`).join("\n")}\nConsider if these changes affect how you classify or score fragments.\n`
      : "";

  const messageText = typeof message === "string" ? message : message.text || message.content || "";

  return `${projectBlock}

ACTIVE CARDS IN THIS CHAT (for conflict context):
${cardsBlock}

${thresholdBlock}MESSAGE TO DECOMPOSE:
"${messageText}"

Decompose exhaustively. Do not merge distinct concerns.`;
}

module.exports = { DECOMPOSE_SYSTEM, buildDecomposePrompt };
