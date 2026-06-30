// services/cardChainer.js — v4 Main orchestrator: runCardPipeline + all utilities
// Uses: ModelRouter → CardDecomposer → CardSynthesizer → CardWriter
const TemporalCard = require("../models/TemporalCard");
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
    token = null,            // §16.4: needed to commit KG diffs into Core (authz'd)
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

    await handleKGSync(card, token);
    return [card];
  }

  // ── Normal flow: decompose message into fragments ────────────────────────
  const fragments = await decomposer.decompose(
    message, projectContext, activeCards, thresholdChanges
  );

  const results = [];
  for (const fragment of fragments) {
    try {
      console.log(`🃏 [Pipeline] Processing fragment ${fragment.id} [${fragment.category}]...`);

      const enrichedMessage = { ...message, projectId: resolvedProjectId };

      // Always fetch lastCard fresh — picks up cards created by previous fragments
      const lastCard = await TemporalCard.findOne({
        projectId: resolvedProjectId,
        category: fragment.category,
        status: "active",
      }).sort({ version: -1 }).lean();

      const synthesis = await synthesizer.synthesize(
        fragment, lastCard, triggerType, configChanges
      );

      const card = await writer.write(
        fragment, synthesis, enrichedMessage, lastCard, triggerType, configChanges
      );

      await handleKGSync(card, token);

      // Mark done before moving to next
      results.push(card);
      console.log(`✅ [Pipeline] Fragment ${fragment.id} done → "${card.title}" (${results.length}/${fragments.length})`);

    } catch (err) {
      // Log and continue — don't let one bad fragment kill the rest
      console.error(`❌ [Pipeline] Fragment ${fragment.id} failed: ${err.message}`);
      results.push(null);
    }
  }

  const elapsed = Date.now() - startTime;
  const succeeded = results.filter(Boolean).length;
  const failed = results.length - succeeded;
  console.log(`🃏 [Pipeline] Complete: ${succeeded} succeeded, ${failed} failed (${elapsed}ms)`);

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KG SYNC — v4 Auto-flush logic
// ═══════════════════════════════════════════════════════════════════════════════

async function handleKGSync(card, token = null) {
  if (!card.kgDiff || !card.kgDiff.add) return;
  const confidence = card.kgDiff.confidence || 0;
  const chatId = card.sourceChatIds?.[0];

  if (confidence >= KG_AUTO_FLUSH) {
    // Auto-flush: commit straight into Core's KG (§16.4 Issue 2).
    if (!token || !chatId) {
      // No way to reach Core (no user token / no source chat) — leave the diff PENDING so the
      // user can commit it manually via the "Commit to KG" button. Never silently lose it.
      console.log(`📊 [KG] Auto-flush deferred (missing ${!token ? "token" : "source chat"}); left pending for manual commit.`);
      return;
    }
    try {
      const r = await pushKGToCore(chatId, card.kgDiff, token);
      await TemporalCard.findByIdAndUpdate(card._id, { "kgDiff.flushed": true, kgUpdated: true });
      console.log(`📊 [KG] Auto-flushed to Core (confidence: ${confidence.toFixed(2)}, +${r.added_nodes} nodes / +${r.added_edges} edges)`);
    } catch (err) {
      console.warn(`📊 [KG] Auto-flush failed: ${err.message}`);
    }
  } else if (confidence >= KG_SUGGEST) {
    // Pending — leave for user review. UI shows "Commit to KG" button.
    console.log(`📊 [KG] Diff pending user review (confidence: ${confidence.toFixed(2)})`);
  } else {
    // Below threshold — discard
    await TemporalCard.findByIdAndUpdate(card._id, { kgDiff: null });
    console.log(`📊 [KG] Diff discarded (confidence: ${confidence.toFixed(2)} below threshold)`);
  }
}

/**
 * §16.4 (Issue 2): push a card's KG diff into Core's Postgres KG (the single source of truth
 * the graph view reads), attached to the card's source chat. Replaces the old dead-end write
 * into the Satellite KGSnapshot mirror — which nothing rendered and `takeSnapshot` overwrote.
 * Core ingestion is idempotent per (chat, section, content), so repeat commits don't duplicate.
 */
async function pushKGToCore(chatId, kgDiff, token) {
  if (!chatId || chatId === "auto" || chatId === "unknown") {
    throw new Error("Card has no source chat to attach KG nodes to.");
  }
  if (!token) {
    throw new Error("Auth token required to commit KG to Core.");
  }

  const payload = {
    nodes: (kgDiff.add || []).map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      confidence: kgDiff.confidence,
    })),
    edges: (kgDiff.edges || []).map((e) => ({ from: e.from, to: e.to, label: e.label })),
    confidence: kgDiff.confidence || null,
  };

  const res = await axios.post(
    `${CORE_API}/chats/${chatId}/kg/ingest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
  );
  return res.data; // { added_nodes, added_edges, chat_id }
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
  let messages = sinceDate
    ? allMessages.filter((m) => new Date(m.created_at || m.createdAt) > sinceDate)
    : allMessages;

  // No messages newer than the last card.
  if (messages.length === 0) {
    if (allMessages.length === 0) {
      throw new Error("This chat is empty. Send a message before generating a card.");
    }
    if (lastCard) {
      // §16.4-3: a card already exists and nothing new arrived. Re-running the pipeline on the
      // same messages just spawns a near-duplicate version off identical input. Instead return the
      // current active card(s) and signal "already up to date" — no churn of the version chain.
      console.log(`[CardChainer] Chat ${chatId} already current — skipping regeneration (no new messages).`);
      const existing = await TemporalCard.find({
        projectId,
        sourceChatIds: chatId,
        status: "active",
      }).sort({ version: -1 }).lean();
      return { cards: existing, upToDate: true };
    }
    // First-ever card for an already-populated chat (e.g. imported history): seed from the last 5
    // messages so the button works on import. Only on first run — never on repeat clicks.
    console.log(`[CardChainer] No prior card for chat ${chatId}; seeding from last 5 messages.`);
    messages = allMessages.slice(-5);
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
    token,
  });

  return { cards, upToDate: false };
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
    token,
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

async function autoGenerateCards(projectId, token, force = false) {
  const expiredCount = await expireOldCards(projectId);

  const lastCard = await TemporalCard.findOne({ projectId, status: "active" })
    .sort({ createdAt: -1 })
    .lean();

  const sinceDate = lastCard
    ? new Date(lastCard.lastMessageTimestamp || lastCard.createdAt)
    : null;
  
  let messages = await fetchProjectMessagesSince(projectId, sinceDate, token);

  // If forced and no new messages, try fetching ALL messages
  if (messages.length === 0 && force) {
    console.log(`[CardChainer] Forced generation for ${projectId} — fetching all messages`);
    messages = await fetchProjectMessagesSince(projectId, null, token);
  }

  if (messages.length === 0) {
    return { message: "No messages found to generate cards from.", expiredCount, generated: [] };
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
      token,
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
    modelUsed: "llama-3.3-70b-versatile",
    generatedBy: "llama-3.3-70b-versatile",
    status: "active",
    expiresAt: new Date(Date.now() + THREE_DAYS_MS),
    lastMessageTimestamp: new Date(),
  });

  console.log(`🃏 Card [general] generated from delta: "${card.title}"`);
  return card;
}

async function updateKGFromCard(projectId, card, token) {
  if (card.kgDiff && card.kgDiff.add && card.kgDiff.add.length > 0) {
    const chatId = card.sourceChatIds?.[0];
    const r = await pushKGToCore(chatId, card.kgDiff, token);  // §16.4: commit into Core KG
    await TemporalCard.findByIdAndUpdate(card._id, { "kgDiff.flushed": true, kgUpdated: true });
    return { added: r.added_nodes, addedEdges: r.added_edges };
  }
  return { added: 0, addedEdges: 0 };
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
