// services/cardChainer.js — Card generation + chaining pipeline (v2)
const TemporalCard = require("../models/TemporalCard");
const KGSnapshot = require("../models/KGSnapshot");
const {
  summarizeDelta,
  generateCardFromMessages,
  classifyCardLabel,
  suggestKGUpdates,
  generateREADMEContent,
  parseCardResponse,
} = require("./hfClient");
const axios = require("axios");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT-BASED CARD GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch messages from a specific chat via the core API.
 */
async function fetchChatMessages(chatId, token) {
  try {
    const res = await axios.get(`${CORE_API}/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return res.data || [];
  } catch (err) {
    console.error(`❌ Failed to fetch messages for chat ${chatId}:`, err.message);
    return [];
  }
}

/**
 * Fetch ALL messages across ALL chats in a project since a given date.
 */
async function fetchProjectMessagesSince(projectId, sinceDate, token) {
  try {
    // 1. Get all chats for this project
    const chatsRes = await axios.get(`${CORE_API}/projects/${projectId}/chats`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const chats = chatsRes.data || [];

    // 2. Fetch messages from each chat
    const allMessages = [];
    for (const chat of chats) {
      const messages = await fetchChatMessages(chat.id, token);
      for (const msg of messages) {
        const msgDate = new Date(msg.created_at);
        if (!sinceDate || msgDate > sinceDate) {
          allMessages.push({ ...msg, _chatId: chat.id, _chatTitle: chat.title });
        }
      }
    }

    // Sort by created_at ascending
    allMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return allMessages;
  } catch (err) {
    console.error(`❌ Failed to fetch project messages:`, err.message);
    return [];
  }
}

/**
 * Generate a card from a specific chat's messages.
 */
async function generateCardFromChat(projectId, chatId, token, forcedLabel = null) {
  // 1. Get the last card for this project
  const lastCard = await TemporalCard.findOne({ projectId })
    .sort({ chainIndex: -1 })
    .lean();

  // 2. Fetch messages from the chat (only new ones since last card)
  const sinceDate = lastCard ? new Date(lastCard.createdAt) : null;
  const allMessages = await fetchChatMessages(chatId, token);
  const messages = sinceDate
    ? allMessages.filter((m) => new Date(m.created_at) > sinceDate)
    : allMessages;

  if (messages.length === 0) {
    throw new Error("No new messages found since the last card was generated.");
  }

  // 3. Auto-classify label if not forced
  const label = forcedLabel || (await classifyCardLabel(messages));

  // 4. Get the latest card for this label (for versioning)
  const latestLabelCard = await TemporalCard.findOne({ projectId, label })
    .sort({ version: -1 })
    .lean();

  // 5. Get current KG snapshot for context
  const kgSnapshot = await KGSnapshot.findOne({ projectId })
    .sort({ snapshotAt: -1 })
    .lean();

  // 6. Call Llama 405B
  const rawResponse = await generateCardFromMessages(messages, latestLabelCard, kgSnapshot, label);
  const parsed = parseCardResponse(rawResponse);

  // 7. Get chain count
  const cardCount = await TemporalCard.countDocuments({ projectId });

  // 8. Create the card
  const card = await TemporalCard.create({
    projectId,
    title: parsed.title,
    summary: parsed.summary,
    keyChanges: parsed.keyChanges,
    label,
    version: latestLabelCard ? latestLabelCard.version + 1 : 1,
    previousVersionId: latestLabelCard?._id || null,
    sourceType: "chat",
    sourceMessageIds: messages.map((m) => m.id).filter(Boolean),
    sourceChatIds: [chatId],
    generatedBy: "meta-llama/Meta-Llama-3.1-405B-Instruct",
    chainIndex: cardCount,
    parentCardId: lastCard?._id || null,
    status: "draft",
    expiresAt: new Date(Date.now() + THREE_DAYS_MS),
  });

  console.log(`🃏 Card #${card.chainIndex} [${label} v${card.version}] generated: "${card.title}"`);
  return card;
}

/**
 * Generate a new version of a card for a specific label.
 * Uses ALL messages across all chats since the last card of this label.
 */
async function generateCardByLabel(projectId, label, token) {
  // 1. Get latest card for this label
  const latestLabelCard = await TemporalCard.findOne({ projectId, label })
    .sort({ version: -1 })
    .lean();

  // 2. Fetch messages since last card
  const sinceDate = latestLabelCard ? new Date(latestLabelCard.createdAt) : null;
  const messages = await fetchProjectMessagesSince(projectId, sinceDate, token);

  if (messages.length === 0) {
    throw new Error(`No new messages found since the last "${label}" card.`);
  }

  // 3. Get KG context
  const kgSnapshot = await KGSnapshot.findOne({ projectId })
    .sort({ snapshotAt: -1 })
    .lean();

  // 4. Generate via Llama
  const rawResponse = await generateCardFromMessages(messages, latestLabelCard, kgSnapshot, label);
  const parsed = parseCardResponse(rawResponse);

  // 5. Chain metadata
  const cardCount = await TemporalCard.countDocuments({ projectId });
  const lastCard = await TemporalCard.findOne({ projectId }).sort({ chainIndex: -1 }).lean();

  // 6. Collect unique chat IDs
  const chatIds = [...new Set(messages.map((m) => m._chatId || m.chat_id).filter(Boolean))];

  // 7. Create
  const card = await TemporalCard.create({
    projectId,
    title: parsed.title,
    summary: parsed.summary,
    keyChanges: parsed.keyChanges,
    label,
    version: latestLabelCard ? latestLabelCard.version + 1 : 1,
    previousVersionId: latestLabelCard?._id || null,
    sourceType: "chat",
    sourceMessageIds: messages.map((m) => m.id).filter(Boolean),
    sourceChatIds: chatIds,
    generatedBy: "meta-llama/Meta-Llama-3.1-405B-Instruct",
    chainIndex: cardCount,
    parentCardId: lastCard?._id || null,
    status: "draft",
    expiresAt: new Date(Date.now() + THREE_DAYS_MS),
  });

  console.log(`🃏 Label card [${label} v${card.version}] generated: "${card.title}"`);
  return card;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPORAL LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mark cards older than 3 days as expired.
 */
async function expireOldCards(projectId) {
  const result = await TemporalCard.updateMany(
    {
      projectId,
      expired: false,
      expiresAt: { $lte: new Date() },
    },
    { $set: { expired: true } }
  );

  if (result.modifiedCount > 0) {
    console.log(`⏰ Expired ${result.modifiedCount} cards for project ${projectId}`);
  }
  return result.modifiedCount;
}

/**
 * Auto-generate cards for a project: expire old cards, generate new ones.
 */
async function autoGenerateCards(projectId, token) {
  // 1. Expire old cards
  const expiredCount = await expireOldCards(projectId);

  // 2. Find the most recent card of any type
  const lastCard = await TemporalCard.findOne({ projectId })
    .sort({ createdAt: -1 })
    .lean();

  // 3. Check if enough time has passed (at least 3 days since last card)
  if (lastCard) {
    const daysSinceLast = (Date.now() - new Date(lastCard.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLast < 3) {
      return {
        message: `Last card was ${daysSinceLast.toFixed(1)} days ago. Next auto-generation in ${(3 - daysSinceLast).toFixed(1)} days.`,
        expiredCount,
        generated: [],
      };
    }
  }

  // 4. Fetch new messages since last card
  const sinceDate = lastCard ? new Date(lastCard.createdAt) : null;
  const messages = await fetchProjectMessagesSince(projectId, sinceDate, token);

  if (messages.length === 0) {
    return { message: "No new messages to generate cards from.", expiredCount, generated: [] };
  }

  // 5. Auto-classify and generate
  const label = await classifyCardLabel(messages);
  const generated = [];

  try {
    const card = await generateCardByLabel(projectId, label, token);
    generated.push(card);

    // 6. Attempt KG update
    try {
      await updateKGFromCard(projectId, card);
    } catch (kgErr) {
      console.warn(`⚠️  KG update skipped: ${kgErr.message}`);
    }
  } catch (genErr) {
    console.error(`❌ Auto-generation failed: ${genErr.message}`);
  }

  return {
    message: `Auto-generation complete. ${generated.length} card(s) created, ${expiredCount} expired.`,
    expiredCount,
    generated,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// KG INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Use AI to suggest KG updates based on a card, then apply them.
 */
async function updateKGFromCard(projectId, card) {
  // 1. Get current KG
  const kgSnapshot = await KGSnapshot.findOne({ projectId })
    .sort({ snapshotAt: -1 })
    .lean();

  // 2. Ask Llama for suggestions
  const suggestions = await suggestKGUpdates(card, kgSnapshot);

  if (suggestions.addNodes.length === 0 && suggestions.removeNodes.length === 0) {
    console.log(`📊 No KG changes suggested for card "${card.title}"`);
    return { added: 0, removed: 0 };
  }

  // 3. Apply to KG snapshot (create a new snapshot with the changes)
  const existingNodes = kgSnapshot?.nodes || [];
  const existingEdges = kgSnapshot?.edges || [];

  // Add new nodes
  const newNodes = [...existingNodes];
  const addedNodeIds = [];
  for (const node of suggestions.addNodes) {
    const { v4: uuidv4 } = require("uuid");
    const nodeId = uuidv4();
    newNodes.push({
      nodeId,
      section: node.section,
      content: node.content,
      confidence: null,
      chatId: card.sourceChatIds?.[0] || "auto",
      synthesisId: null,
    });
    addedNodeIds.push(nodeId);
  }

  // Remove nodes (fuzzy match by content fragment)
  const removedNodeIds = [];
  const filteredNodes = newNodes.filter((n) => {
    const shouldRemove = suggestions.removeNodes.some(
      (frag) => n.content.toLowerCase().includes(frag.toLowerCase())
    );
    if (shouldRemove) removedNodeIds.push(n.nodeId);
    return !shouldRemove;
  });

  // 4. Save new snapshot
  if (addedNodeIds.length > 0 || removedNodeIds.length > 0) {
    await KGSnapshot.create({
      projectId,
      nodes: filteredNodes,
      edges: existingEdges,
      nodeCount: filteredNodes.length,
      edgeCount: existingEdges.length,
      version: (kgSnapshot?.version || 0) + 1,
    });

    // 5. Update the card with KG impact
    await TemporalCard.findByIdAndUpdate(card._id, {
      kgNodesAdded: addedNodeIds,
      kgNodesRemoved: removedNodeIds,
      kgUpdated: true,
    });

    console.log(`📊 KG updated: +${addedNodeIds.length} / -${removedNodeIds.length} nodes`);
  }

  return { added: addedNodeIds.length, removed: removedNodeIds.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY + UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a TemporalCard from a GraphDelta (legacy path).
 */
async function generateCardFromDelta(projectId, delta) {
  const cardCount = await TemporalCard.countDocuments({ projectId });
  const lastCard = await TemporalCard.findOne({ projectId }).sort({ chainIndex: -1 }).lean();

  const rawResponse = await summarizeDelta(delta);
  const parsed = parseCardResponse(rawResponse);

  const card = await TemporalCard.create({
    projectId,
    deltaId: delta._id,
    title: parsed.title,
    summary: parsed.summary,
    keyChanges: parsed.keyChanges,
    label: "general",
    sourceType: "delta",
    generatedBy: "meta-llama/Meta-Llama-3.1-405B-Instruct",
    chainIndex: cardCount,
    parentCardId: lastCard?._id || null,
    status: "draft",
    expiresAt: new Date(Date.now() + THREE_DAYS_MS),
  });

  console.log(`🃏 Card #${card.chainIndex} generated from delta: "${card.title}"`);
  return card;
}

/**
 * Get all cards for a project, chained in order.
 */
async function getChainedCards(projectId) {
  // Also expire while fetching
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId }).sort({ chainIndex: 1 }).lean();
}

/**
 * Get cards filtered by label, latest version first.
 */
async function getCardsByLabel(projectId, label) {
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId, label }).sort({ version: -1 }).lean();
}

/**
 * Get only expired cards.
 */
async function getExpiredCards(projectId) {
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId, expired: true }).sort({ createdAt: -1 }).lean();
}

/**
 * Refresh an expired card — generates a new version.
 */
async function refreshCard(projectId, cardId, token) {
  const oldCard = await TemporalCard.findById(cardId).lean();
  if (!oldCard) throw new Error("Card not found");

  // Generate a new version of the same label
  const card = await generateCardByLabel(projectId, oldCard.label, token);
  card.sourceType = "auto_refresh";
  await TemporalCard.findByIdAndUpdate(card._id, { sourceType: "auto_refresh" });
  return card;
}

/**
 * Generate a README from all chained cards.
 */
async function generateREADME(projectId, token) {
  const cards = await getChainedCards(projectId);
  if (cards.length === 0) {
    return "# No Cards Yet\n\nGenerate temporal cards from chats first.";
  }

  let projectInfo = { name: "Project", purpose: "N/A", success_criteria: "N/A" };
  try {
    const res = await axios.get(`${CORE_API}/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    projectInfo = res.data;
  } catch (err) {
    console.warn("⚠️  Could not fetch project info:", err.message);
  }

  return generateREADMEContent(cards, projectInfo);
}

/**
 * Generate Mermaid UML from a KG snapshot.
 */
function generateMermaidUML(snapshot) {
  if (!snapshot || !snapshot.nodes || snapshot.nodes.length === 0) {
    return "graph TD\n  empty[No KG data available]";
  }

  const lines = ["graph TD"];
  lines.push("  classDef fact fill:#22c55e,stroke:#16a34a,color:#fff");
  lines.push("  classDef decision fill:#8b5cf6,stroke:#7c3aed,color:#fff");
  lines.push("  classDef conflict fill:#ef4444,stroke:#dc2626,color:#fff");
  lines.push("  classDef option fill:#3b82f6,stroke:#2563eb,color:#fff");
  lines.push("  classDef unknown fill:#f59e0b,stroke:#d97706,color:#fff");
  lines.push("  classDef assumption fill:#06b6d4,stroke:#0891b2,color:#fff");
  lines.push("");

  for (const node of snapshot.nodes) {
    const label = node.content.replace(/"/g, "'").substring(0, 60);
    const id = node.nodeId.replace(/-/g, "");
    lines.push(`  ${id}["${label}"]`);
    lines.push(`  class ${id} ${node.section.toLowerCase()}`);
  }

  for (const edge of snapshot.edges || []) {
    const from = edge.fromNodeId.replace(/-/g, "");
    const to = edge.toNodeId.replace(/-/g, "");
    const label = edge.relation;
    lines.push(`  ${from} -->|${label}| ${to}`);
  }

  return lines.join("\n");
}

/**
 * Generate a markdown slide deck from chained cards.
 */
async function generatePPTSlides(projectId) {
  const cards = await getChainedCards(projectId);
  if (cards.length === 0) {
    return "---\n# No Cards Available\n\nGenerate temporal cards first.\n---";
  }

  const slides = [];
  slides.push(`---\n# Project Evolution Report\n\n**${cards.length} Updates** tracked over time\n\n---`);

  for (const card of cards) {
    let slide = `---\n## ${card.title}\n\n${card.summary}\n`;
    if (card.keyChanges && card.keyChanges.length > 0) {
      slide += "\n### Key Changes\n";
      slide += card.keyChanges.map((c) => `- ${c}`).join("\n");
    }
    const labelBadge = card.label ? ` [${card.label.toUpperCase()}]` : "";
    const versionBadge = card.version > 1 ? ` v${card.version}` : "";
    slide += `\n\n*Card #${card.chainIndex + 1}${labelBadge}${versionBadge} — ${new Date(card.createdAt).toLocaleDateString()}*\n---`;
    slides.push(slide);
  }

  return slides.join("\n\n");
}

module.exports = {
  generateCardFromDelta,
  generateCardFromChat,
  generateCardByLabel,
  autoGenerateCards,
  expireOldCards,
  updateKGFromCard,
  refreshCard,
  getChainedCards,
  getCardsByLabel,
  getExpiredCards,
  generateREADME,
  generateMermaidUML,
  generatePPTSlides,
};
