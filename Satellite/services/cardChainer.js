// services/cardChainer.js — v4 Main orchestrator: runCardPipeline + all utilities
// Uses: ModelRouter → CardDecomposer → CardSynthesizer → CardWriter
const TemporalCard = require("../models/TemporalCard");
const KGSnapshot = require("../models/KGSnapshot");
const { ModelRouter } = require("./modelRouter");
const { CardDecomposer } = require("./cardDecomposer");
const { CardSynthesizer } = require("./cardSynthesizer");
const { CardWriter } = require("./cardWriter");
const axios = require("axios");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Shared model router instance
const modelRouter = new ModelRouter();

// KG config defaults
const KG_AUTO_FLUSH = parseFloat(process.env.KG_AUTO_FLUSH_THRESHOLD || "0.88");
const KG_SUGGEST = parseFloat(process.env.KG_SUGGEST_THRESHOLD || "0.60");

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE — v4
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the full v4 card pipeline for a message.
 * One message → N fragments → N cards (created / versioned / updated).
 */
async function runCardPipeline(message, existingCard = null, options = {}) {
  const {
    triggerType = "new_message",
    thresholdChanges = [],
    configChanges = null,
    projectId = null,
  } = options;

  const decomposer = new CardDecomposer(modelRouter);
  const synthesizer = new CardSynthesizer(modelRouter);
  const writer = new CardWriter();

  const startTime = Date.now();

  // Resolve chat/project context
  const chatId = message?._chatId || message?.chat_id || message?.chatId ||
    existingCard?.sourceChatIds?.[0] || "unknown";
  const resolvedProjectId = projectId || message?.projectId || existingCard?.projectId || "unknown";

  // Load active cards for conflict context
  const activeCards = await TemporalCard.find({
    sourceChatIds: chatId,
    status: "active",
  }).lean();

  // Build minimal project context (for decomposition prompt)
  const projectContext = { name: resolvedProjectId, techStack: [] };

  // ── Threshold-change trigger: no new message, use existing card content ───
  if (triggerType === "threshold_change" && !message && existingCard) {
    const fragment = {
      id: "threshold_trigger",
      category: existingCard.category,
      raw_text: existingCard.sourceFragment || existingCard.summary,
      summary: existingCard.summary,
      confidence: existingCard.fragmentConfidence || 0.5,
      kg_nodes_affected: [],
      key_changes: [],
    };

    const synthesis = await synthesizer.synthesize(
      fragment, existingCard, "threshold_change", configChanges
    );

    const card = await writer.write(
      fragment, synthesis, null, existingCard, "threshold_change", configChanges
    );

    await handleKGSync(card);
    return [card];
  }

  // ── Normal flow: decompose message into fragments ────────────────────────
  const fragments = await decomposer.decompose(
    message, projectContext, activeCards, thresholdChanges
  );

  // Process each fragment
  const results = [];
  for (const fragment of fragments) {
    // Enrich fragment with projectId for the writer
    const enrichedMessage = { ...message, projectId: resolvedProjectId };

    // Find the latest active card for this chain
    const lastCard = await TemporalCard.findOne({
      chainIndex: `${chatId}_${fragment.category}`,
      status: "active",
    }).sort({ version: -1 }).lean();

    const synthesis = await synthesizer.synthesize(
      fragment, lastCard, triggerType, configChanges
    );

    const card = await writer.write(
      fragment, synthesis, enrichedMessage, lastCard, triggerType, configChanges
    );

    await handleKGSync(card);
    results.push(card);
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `🃏 [Pipeline] Processed ${results.length} card(s) in ${elapsed}ms ` +
    `(project: ${resolvedProjectId}, chat: ${chatId})`
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KG SYNC — v4 Auto-flush logic
// ═══════════════════════════════════════════════════════════════════════════════

async function handleKGSync(card) {
  if (!card.kgDiff || !card.kgDiff.add) return;
  const confidence = card.kgDiff.confidence || 0;

  if (confidence >= KG_AUTO_FLUSH) {
    // Auto-flush: apply to KG snapshot
    try {
      await applyKGDiff(card.projectId, card.kgDiff);
      await TemporalCard.findByIdAndUpdate(card._id, { "kgDiff.flushed": true });
      console.log(`📊 [KG] Auto-flushed diff (confidence: ${confidence.toFixed(2)})`);
    } catch (err) {
      console.warn(`📊 [KG] Auto-flush failed: ${err.message}`);
    }
  } else if (confidence >= KG_SUGGEST) {
    // Pending — leave for user review. UI shows "Update KG" button.
    console.log(`📊 [KG] Diff pending user review (confidence: ${confidence.toFixed(2)})`);
  } else {
    // Below threshold — discard
    await TemporalCard.findByIdAndUpdate(card._id, { kgDiff: null });
    console.log(`📊 [KG] Diff discarded (confidence: ${confidence.toFixed(2)} below threshold)`);
  }
}

async function applyKGDiff(projectId, kgDiff) {
  const kgSnapshot = await KGSnapshot.findOne({ projectId })
    .sort({ snapshotAt: -1 })
    .lean();

  const existingNodes = kgSnapshot?.nodes || [];
  const existingEdges = kgSnapshot?.edges || [];

  const { v4: uuidv4 } = require("uuid");

  // Add new nodes
  const newNodes = [...existingNodes];
  for (const node of kgDiff.add || []) {
    const rawSection = node.type?.toUpperCase() || "FACT";
    const validSections = ["FACT", "CONSTRAINT", "ASSUMPTION", "OPTION", "DECISION", "CONFLICT", "UNKNOWN", "CONFIDENCE", "EXAMPLE"];
    
    newNodes.push({
      nodeId: uuidv4(),
      section: validSections.includes(rawSection) ? rawSection : "FACT",
      content: node.label || "Unknown",
      confidence: kgDiff.confidence || null,
      chatId: "auto",
      synthesisId: null,
    });
  }

  // Remove nodes
  const removeIds = new Set((kgDiff.remove || []).map((r) => r.id));
  const filteredNodes = newNodes.filter((n) => !removeIds.has(n.nodeId));

  // Add edges
  const newEdges = [...existingEdges];
  const validRelations = ["SUPPORTS", "CONTRADICTS", "REFINES", "DEPENDS_ON", "BLOCKS", "ALTERNATIVE_OF"];
  
  for (const edge of kgDiff.edges || []) {
    const rawRelation = edge.label?.toUpperCase() || "SUPPORTS";
    
    newEdges.push({
      edgeId: uuidv4(),
      fromNodeId: edge.from,
      toNodeId: edge.to,
      relation: validRelations.includes(rawRelation) ? rawRelation : "SUPPORTS",
      chatId: "auto",
    });
  }

  // Save new snapshot
  if ((kgDiff.add || []).length > 0 || (kgDiff.remove || []).length > 0) {
    await KGSnapshot.create({
      projectId,
      nodes: filteredNodes,
      edges: newEdges,
      nodeCount: filteredNodes.length,
      edgeCount: newEdges.length,
      version: (kgSnapshot?.version || 0) + 1,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT MESSAGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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

async function fetchProjectMessagesSince(projectId, sinceDate, token) {
  try {
    const chatsRes = await axios.get(`${CORE_API}/projects/${projectId}/chats`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const chats = chatsRes.data || [];

    const allMessages = [];
    for (const chat of chats) {
      const messages = await fetchChatMessages(chat.id, token);
      for (const msg of messages) {
        const msgDate = new Date(msg.created_at);
        if (!sinceDate || msgDate > sinceDate) {
          allMessages.push({ ...msg, _chatId: chat.id, _chatTitle: chat.title, projectId });
        }
      }
    }

    allMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return allMessages;
  } catch (err) {
    console.error(`❌ Failed to fetch project messages:`, err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL ENTRYPOINTS (used by routes)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate cards from a specific chat. v4: decomposes messages, one card per fragment.
 */
async function generateCardFromChat(projectId, chatId, token, forcedLabel = null) {
  // Fetch messages since last active card
  const lastCard = await TemporalCard.findOne({
    projectId,
    sourceChatIds: chatId,
    status: "active",
  }).sort({ createdAt: -1 }).lean();

  const sinceDate = lastCard ? new Date(lastCard.lastMessageTimestamp || lastCard.createdAt) : null;
  const allMessages = await fetchChatMessages(chatId, token);
  const messages = sinceDate
    ? allMessages.filter((m) => new Date(m.created_at) > sinceDate)
    : allMessages;

  if (messages.length === 0) {
    throw new Error("No new messages found since the last card was generated.");
  }

  // Combine all messages into a single text block for decomposition
  const combinedText = messages
    .map((m) => `[${m.role || "user"}] ${m.sender || "unknown"}: ${m.text}`)
    .join("\n");

  const megaMessage = {
    text: combinedText,
    _chatId: chatId,
    projectId,
    id: messages[messages.length - 1]?.id,
    created_at: messages[messages.length - 1]?.created_at,
  };

  const cards = await runCardPipeline(megaMessage, null, {
    projectId,
    triggerType: "new_message",
  });

  return cards;
}

/**
 * Generate a new card for a specific label/category from all project messages.
 */
async function generateCardByLabel(projectId, label, token) {
  const latestLabelCard = await TemporalCard.findOne({
    projectId,
    category: label,
    status: "active",
  }).sort({ version: -1 }).lean();

  const sinceDate = latestLabelCard
    ? new Date(latestLabelCard.lastMessageTimestamp || latestLabelCard.createdAt)
    : null;
  const messages = await fetchProjectMessagesSince(projectId, sinceDate, token);

  if (messages.length === 0) {
    throw new Error(`No new messages found since the last "${label}" card.`);
  }

  const combinedText = messages
    .map((m) => `[${m.role || "user"}] ${m.sender || "unknown"}: ${m.text}`)
    .join("\n");

  const chatIds = [...new Set(messages.map((m) => m._chatId).filter(Boolean))];

  const megaMessage = {
    text: combinedText,
    _chatId: chatIds[0] || "project-wide",
    projectId,
    id: messages[messages.length - 1]?.id,
    created_at: messages[messages.length - 1]?.created_at,
  };

  const cards = await runCardPipeline(megaMessage, null, {
    projectId,
    triggerType: "new_message",
  });

  return cards;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPORAL LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

async function expireOldCards(projectId) {
  // Expiry removed per user request: cards will remain active indefinitely.
  return 0;
}

async function autoGenerateCards(projectId, token) {
  const expiredCount = await expireOldCards(projectId);

  const lastCard = await TemporalCard.findOne({ projectId, status: "active" })
    .sort({ createdAt: -1 })
    .lean();

  const sinceDate = lastCard
    ? new Date(lastCard.lastMessageTimestamp || lastCard.createdAt)
    : null;
  const messages = await fetchProjectMessagesSince(projectId, sinceDate, token);

  if (messages.length === 0) {
    return { message: "No new messages to generate cards from.", expiredCount, generated: [] };
  }

  const generated = [];
  try {
    const combinedText = messages
      .map((m) => `[${m.role || "user"}] ${m.sender || "unknown"}: ${m.text}`)
      .join("\n");

    const chatIds = [...new Set(messages.map((m) => m._chatId).filter(Boolean))];

    const megaMessage = {
      text: combinedText,
      _chatId: chatIds[0] || "project-wide",
      projectId,
      id: messages[messages.length - 1]?.id,
      created_at: messages[messages.length - 1]?.created_at,
    };

    const cards = await runCardPipeline(megaMessage, null, {
      projectId,
      triggerType: "scheduled_update",
    });

    generated.push(...cards);
  } catch (genErr) {
    console.error(`❌ Auto-generation failed: ${genErr.message}`);
  }

  return {
    message: `Auto-generation complete. ${generated.length} card(s) created, ${expiredCount} stale.`,
    expiredCount,
    generated,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function getChainedCards(projectId) {
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId }).sort({ createdAt: 1 }).lean();
}

async function getCardsByLabel(projectId, label) {
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId, category: label }).sort({ version: -1 }).lean();
}

async function getCardsByCategory(projectId, category) {
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId, category }).sort({ version: -1 }).lean();
}

async function getExpiredCards(projectId) {
  await expireOldCards(projectId);
  return TemporalCard.find({ projectId, status: "stale" }).sort({ createdAt: -1 }).lean();
}

async function getCardHistory(cardId) {
  const card = await TemporalCard.findById(cardId).lean();
  if (!card) return [];

  const history = [card];
  let current = card;

  while (current.previousCardId) {
    const prev = await TemporalCard.findById(current.previousCardId).lean();
    if (!prev) break;
    history.unshift(prev);
    current = prev;
  }

  return history;
}

async function refreshCard(projectId, cardId, token) {
  const oldCard = await TemporalCard.findById(cardId).lean();
  if (!oldCard) throw new Error("Card not found");

  const cards = await generateCardByLabel(projectId, oldCard.category || oldCard.label, token);
  return cards[0] || oldCard;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY COMPAT + EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const {
  summarizeDelta,
  generateREADMEContent,
  parseCardResponse,
} = require("./hfClient");

async function generateCardFromDelta(projectId, delta) {
  const cardCount = await TemporalCard.countDocuments({ projectId });
  const lastCard = await TemporalCard.findOne({ projectId }).sort({ createdAt: -1 }).lean();

  const rawResponse = await summarizeDelta(delta);
  const parsed = parseCardResponse(rawResponse);

  const card = await TemporalCard.create({
    projectId,
    chainIndex: `${projectId}_general`,
    category: "general",
    title: parsed.title,
    summary: parsed.summary,
    keyChanges: parsed.keyChanges,
    version: 1,
    sourceType: "delta",
    deltaId: delta._id,
    triggerType: "new_message",
    modelUsed: "llama-3.1-70b-versatile",
    generatedBy: "llama-3.1-70b-versatile",
    status: "active",
    expiresAt: new Date(Date.now() + THREE_DAYS_MS),
    lastMessageTimestamp: new Date(),
  });

  console.log(`🃏 Card [general] generated from delta: "${card.title}"`);
  return card;
}

async function updateKGFromCard(projectId, card) {
  if (card.kgDiff && card.kgDiff.add && card.kgDiff.add.length > 0) {
    await applyKGDiff(projectId, card.kgDiff);
    await TemporalCard.findByIdAndUpdate(card._id, { "kgDiff.flushed": true, kgUpdated: true });
    return { added: card.kgDiff.add.length, removed: (card.kgDiff.remove || []).length };
  }
  return { added: 0, removed: 0 };
}

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
    const categoryBadge = card.category ? ` [${card.category.toUpperCase()}]` : "";
    const versionBadge = card.version > 1 ? ` v${card.version}` : "";
    slide += `\n\n*${categoryBadge}${versionBadge} — ${new Date(card.createdAt).toLocaleDateString()}*\n---`;
    slides.push(slide);
  }

  return slides.join("\n\n");
}

module.exports = {
  runCardPipeline,
  generateCardFromDelta,
  generateCardFromChat,
  generateCardByLabel,
  autoGenerateCards,
  expireOldCards,
  updateKGFromCard,
  refreshCard,
  getChainedCards,
  getCardsByLabel,
  getCardsByCategory,
  getCardHistory,
  getExpiredCards,
  generateREADME,
  generateMermaidUML,
  generatePPTSlides,
};
