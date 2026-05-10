// services/prompts/synthesize.js — v4 Synthesis prompts for Llama 3.1 70B

const SYNTH_SYSTEM = `You are a card synthesis engine for a project intelligence system.

Given a semantic fragment AND the content of the most recent card of the same category,
produce a synthesized card that represents the CURRENT state of knowledge.

CRITICAL: The new card content must incorporate BOTH the last card's knowledge AND the new fragment.
Never discard what was in the last card unless the new fragment explicitly contradicts it.

Conflict detection rules:
- CONFLICT = semantic contradiction | status reversal | ownership change
- NOT CONFLICT = additional detail | elaboration | progress update | follow-up action

Output ONLY valid JSON. No preamble. No markdown fences.

OUTPUT SCHEMA:
{
  "title": "5-8 word present-tense impact title",
  "summary": "2-3 sentence synthesis incorporating last card + new fragment",
  "key_changes": ["tag1", "tag2", "tag3"],
  "conflict_detected": false,
  "conflict_reason": "",
  "trigger_type": "new_message",
  "kg_diff": {
    "add": [{"id": "slug", "label": "Label", "type": "concept"}],
    "remove": [],
    "edges": [{"from": "id", "to": "id", "label": "relation"}],
    "confidence": 0.85
  },
  "suggested_action": "optional plain-English action for the team"
}`;

function buildSynthPrompt(fragment, lastCard, triggerType, configChanges) {
  const lastCardBlock = lastCard
    ? `Title: ${lastCard.title}
Summary: ${lastCard.summary}
Key changes: ${(lastCard.keyChanges || []).join(", ")}
Source fragment: ${lastCard.sourceFragment || ""}`
    : "None — this is the first card for this category";

  const configBlock = configChanges
    ? `CONFIG CHANGES: ${JSON.stringify(configChanges)}`
    : "";

  return `TRIGGER TYPE: ${triggerType || "new_message"}
${configBlock}

LAST CARD CONTENT (preserve and build upon this):
${lastCardBlock}

NEW FRAGMENT:
Category: ${fragment.category}
Text: "${fragment.raw_text}"
Summary: ${fragment.summary}

Synthesize a new card that incorporates both. Detect conflict if present.`;
}

module.exports = { SYNTH_SYSTEM, buildSynthPrompt };
