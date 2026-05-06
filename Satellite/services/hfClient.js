// services/hfClient.js — HuggingFace Inference API client (Llama 405B)
const axios = require("axios");

const HF_TOKEN = process.env.HF_TOKEN;
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const MODEL_PRIMARY = "meta-llama/Meta-Llama-3.1-405B-Instruct";
const MODEL_FALLBACK = "meta-llama/Llama-3.3-70B-Instruct";

// ─── Helper: call HF with automatic fallback ─────────────────────────────────
async function callHF(messages, { temperature = 0.2, max_tokens = 1500, model = MODEL_PRIMARY } = {}) {
  const doCall = async (m) => {
    const res = await axios.post(
      HF_API_URL,
      { model: m, messages, temperature, max_tokens },
      {
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );
    return res.data.choices[0].message.content;
  };

  try {
    return await doCall(model);
  } catch (err) {
    if (model === MODEL_PRIMARY) {
      console.warn(`⚠️  Llama 405B failed (${err.message}), falling back to 70B...`);
      return await doCall(MODEL_FALLBACK);
    }
    throw err;
  }
}

// ─── 1. Summarize a KG delta (legacy — kept for backward compat) ─────────────
async function summarizeDelta(deltaData) {
  const prompt = `You are a project knowledge summarizer.

Given the following changes to a project's Knowledge Graph over the last period:

ADDED NODES:
${deltaData.addedNodes.map((n) => `- [${n.section}] ${n.content}`).join("\n") || "- None"}

REMOVED NODES:
${deltaData.removedNodes.map((n) => `- [${n.section}] ${n.content}`).join("\n") || "- None"}

ADDED EDGES:
${deltaData.addedEdges.map((e) => `- ${e.relation}: ${e.fromNodeId} → ${e.toNodeId}`).join("\n") || "- None"}

REMOVED EDGES:
${deltaData.removedEdges.map((e) => `- ${e.relation}: ${e.fromNodeId} → ${e.toNodeId}`).join("\n") || "- None"}

Generate a concise project update card with:
1. TITLE: A short, descriptive title (max 10 words)
2. SUMMARY: A 2-3 sentence summary of what changed and why it matters
3. KEY_CHANGES: A bullet list of the 3-5 most important changes

Format your response exactly as:
TITLE: <title>
SUMMARY: <summary>
KEY_CHANGES:
- <change 1>
- <change 2>
- <change 3>`;

  return callHF([
    { role: "system", content: "You are a concise project summarizer." },
    { role: "user", content: prompt },
  ]);
}

// ─── 2. Generate card from chat messages ─────────────────────────────────────
async function generateCardFromMessages(messages, previousCard, kgContext, label) {
  const messageBlock = messages
    .map((m) => `[${m.role || "user"}] ${m.sender || "unknown"} (${m.created_at || "unknown"}): ${m.text}`)
    .join("\n");

  const previousCardBlock = previousCard
    ? `PREVIOUS CARD (v${previousCard.version}, label: ${previousCard.label}):\nTitle: ${previousCard.title}\nSummary: ${previousCard.summary}\nKey Changes:\n${(previousCard.keyChanges || []).map((c) => `- ${c}`).join("\n")}`
    : "No previous card exists for this label.";

  const kgBlock = kgContext && kgContext.nodes && kgContext.nodes.length > 0
    ? `CURRENT KG STATE (${kgContext.nodes.length} nodes):\n${kgContext.nodes.slice(0, 30).map((n) => `- [${n.section}] ${n.content}`).join("\n")}`
    : "No Knowledge Graph data available.";

  const prompt = `You are a project intelligence analyst. Your job is to generate a focused "${label}" update card from recent project chat messages.

${previousCardBlock}

${kgBlock}

RECENT CHAT MESSAGES (${messages.length} messages):
${messageBlock}

Based on these messages, generate an update card focused on the "${label}" category.

Rules:
- If this is a newer version of an existing card, highlight what CHANGED since the previous version
- Focus specifically on "${label}" aspects of the discussion
- Be concise but capture all critical information
- Include actionable insights

Format your response exactly as:
TITLE: <title — max 10 words, specific to ${label}>
SUMMARY: <2-3 sentence summary focused on ${label} implications>
KEY_CHANGES:
- <change/insight 1>
- <change/insight 2>
- <change/insight 3>
- <change/insight 4>
- <change/insight 5>`;

  return callHF([
    { role: "system", content: `You are a project intelligence analyst specializing in ${label} analysis. Output only the requested format.` },
    { role: "user", content: prompt },
  ], { max_tokens: 800 });
}

// ─── 3. Auto-classify card label ─────────────────────────────────────────────
async function classifyCardLabel(messages) {
  const messageBlock = messages
    .slice(0, 20)
    .map((m) => `[${m.role || "user"}]: ${m.text.substring(0, 200)}`)
    .join("\n");

  const prompt = `Given these project chat messages, classify them into ONE primary category.

MESSAGES:
${messageBlock}

Categories:
- risk: Messages about risks, threats, vulnerabilities, blockers, failures
- decision: Messages about decisions made, choices, tradeoffs
- architecture: Messages about system design, technical architecture, stack choices
- progress: Messages about progress updates, milestones, status reports
- conflict: Messages about disagreements, contradictions, competing approaches
- general: Messages that don't fit any specific category

Respond with ONLY the category name (one word, lowercase):`;

  const result = await callHF([
    { role: "system", content: "You are a classifier. Respond with only one word." },
    { role: "user", content: prompt },
  ], { temperature: 0.1, max_tokens: 20 });

  const label = result.trim().toLowerCase().replace(/[^a-z]/g, "");
  const validLabels = ["risk", "decision", "architecture", "progress", "conflict", "general"];
  return validLabels.includes(label) ? label : "general";
}

// ─── 4. Suggest KG updates from card ─────────────────────────────────────────
async function suggestKGUpdates(card, kgSnapshot) {
  const existingNodes = (kgSnapshot?.nodes || [])
    .slice(0, 30)
    .map((n) => `- [${n.section}] ${n.content}`)
    .join("\n") || "- None";

  const prompt = `You are a knowledge graph curator. Based on a new project update card, suggest changes to the Knowledge Graph.

CARD:
Title: ${card.title}
Label: ${card.label}
Summary: ${card.summary}
Key Changes:
${(card.keyChanges || []).map((c) => `- ${c}`).join("\n")}

EXISTING KG NODES (sample):
${existingNodes}

Suggest nodes to ADD or REMOVE. Only suggest changes that are clearly supported by the card.

Valid sections: FACT, CONSTRAINT, ASSUMPTION, OPTION, DECISION, CONFLICT, UNKNOWN

Format your response exactly as:
ADD_NODES:
- [SECTION] content of new node
- [SECTION] content of new node

REMOVE_NODES:
- content fragment of node to remove

If no changes needed, respond with:
ADD_NODES:
- None
REMOVE_NODES:
- None`;

  const result = await callHF([
    { role: "system", content: "You are a knowledge graph curator. Be conservative — only suggest well-supported changes." },
    { role: "user", content: prompt },
  ], { temperature: 0.1, max_tokens: 600 });

  return parseKGSuggestions(result);
}

// ─── 5. Parse helpers ────────────────────────────────────────────────────────

function parseCardResponse(raw) {
  const titleMatch = raw.match(/TITLE:\s*(.+)/i);
  const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]*?)(?=KEY_CHANGES:|$)/i);
  const changesMatch = raw.match(/KEY_CHANGES:\s*([\s\S]*)/i);

  const title = titleMatch ? titleMatch[1].trim() : "Untitled Update";
  const summary = summaryMatch ? summaryMatch[1].trim() : raw.trim();

  let keyChanges = [];
  if (changesMatch) {
    keyChanges = changesMatch[1]
      .split("\n")
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter((l) => l.length > 0 && l.toLowerCase() !== "none");
  }

  return { title, summary, keyChanges };
}

function parseKGSuggestions(raw) {
  const addMatch = raw.match(/ADD_NODES:\s*([\s\S]*?)(?=REMOVE_NODES:|$)/i);
  const removeMatch = raw.match(/REMOVE_NODES:\s*([\s\S]*)/i);

  const addNodes = [];
  if (addMatch) {
    const lines = addMatch[1].split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter((l) => l && l.toLowerCase() !== "none");
    for (const line of lines) {
      const sectionMatch = line.match(/^\[(\w+)\]\s*(.+)/);
      if (sectionMatch) {
        addNodes.push({ section: sectionMatch[1].toUpperCase(), content: sectionMatch[2].trim() });
      }
    }
  }

  const removeNodes = [];
  if (removeMatch) {
    removeNodes.push(
      ...removeMatch[1]
        .split("\n")
        .map((l) => l.replace(/^-\s*/, "").trim())
        .filter((l) => l && l.toLowerCase() !== "none")
    );
  }

  return { addNodes, removeNodes };
}

// ─── 6. README generation (legacy — kept) ────────────────────────────────────
async function generateREADMEContent(cards, projectInfo) {
  const cardsBlock = cards
    .map(
      (c, i) =>
        `### Update ${i + 1} — ${c.title} [${c.label || "general"}]\n${c.summary}\n${(c.keyChanges || []).map((k) => `- ${k}`).join("\n")}`
    )
    .join("\n\n");

  const prompt = `You are a technical documentation writer.

Given the following project information and a series of temporal update cards, generate a professional README.md.

PROJECT: ${projectInfo.name || "Clarity Stack Project"}
PURPOSE: ${projectInfo.purpose || "N/A"}
SUCCESS CRITERIA: ${projectInfo.success_criteria || "N/A"}

TEMPORAL CARDS (chronological updates):
${cardsBlock}

Generate a complete README.md with sections:
- # Project Title
- ## Overview
- ## Key Decisions
- ## Architecture Notes
- ## Current Status
- ## Timeline of Changes

Use markdown formatting. Be concise and professional.`;

  return callHF([
    { role: "system", content: "You are a technical documentation writer. Output only valid Markdown." },
    { role: "user", content: prompt },
  ], { max_tokens: 2000, temperature: 0.3 });
}

module.exports = {
  summarizeDelta,
  generateCardFromMessages,
  classifyCardLabel,
  suggestKGUpdates,
  generateREADMEContent,
  parseCardResponse,
  parseKGSuggestions,
};
