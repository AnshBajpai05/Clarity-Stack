// services/cardWriter.js — v4 Card Writer: all 4 write cases + version chaining
// Case 1: First card for category → CREATE v1
// Case 2: Conflict or threshold change → NEW VERSION (archive old)
// Case 3: Same category, no conflict → UPDATE in-place
// Case 4: No new messages → handled by scheduler (skip / mark stale)

const TemporalCard = require("../models/TemporalCard");

const DEFAULT_EXPIRY_DAYS = parseInt(process.env.CARD_EXPIRY_DAYS || "3", 10);

class CardWriter {
  /**
   * Write a card to the database based on the synthesis result.
   *
   * @param {Object} fragment - Decomposed fragment
   * @param {Object} synthesis - Output from CardSynthesizer
   * @param {Object|null} message - Original chat message (null for threshold triggers)
   * @param {Object|null} lastCard - Previous active card for this chain (null = first)
   * @param {string} triggerType - "new_message" | "conflict" | "threshold_change" | "scheduled_update"
   * @param {Object|null} configChanges - Config changes that triggered this
   * @returns {Object} The created/updated TemporalCard document
   */
  async write(fragment, synthesis, message, lastCard, triggerType = "new_message", configChanges = null) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const chatId = message?._chatId || message?.chat_id || message?.chatId || lastCard?.sourceChatIds?.[0] || "unknown";
    const projectId = message?.projectId || lastCard?.projectId || "unknown";
    const chainIndex = `${chatId}_${fragment.category}`;

    // ── CASE 1: First card for this category ──────────────────────────
    if (!lastCard) {
      const cardCount = await TemporalCard.countDocuments({ projectId });

      const card = await TemporalCard.create({
        projectId,
        chainIndex,
        version: 1,
        category: fragment.category,
        title: synthesis.title,
        summary: synthesis.summary,
        keyChanges: synthesis.key_changes,
        sourceFragment: fragment.raw_text,
        fragmentConfidence: fragment.confidence,
        sourceChatIds: [chatId],
        sourceMessageIds: message ? [message.id || message._id] : [],
        previousCardId: null,
        conflictDetected: false,
        conflictReason: "",
        triggerType: "new_message",
        status: "active",
        expiresAt,
        lastMessageTimestamp: message?.created_at ? new Date(message.created_at) : now,
        kgDiff: {
          add: synthesis.kg_diff?.add || [],
          remove: synthesis.kg_diff?.remove || [],
          edges: synthesis.kg_diff?.edges || [],
          confidence: synthesis.kg_diff?.confidence || 0,
          flushed: false,
        },
        suggestedAction: synthesis.suggested_action || null,
        modelUsed: "llama-3.1-70b-versatile",
      });

      console.log(`🃏 [CardWriter] CREATED v1 [${fragment.category}] "${card.title}"`);
      return card;
    }

    // ── CASE 2: Conflict or threshold change → NEW VERSION ───────────
    if (synthesis.conflict_detected || triggerType === "threshold_change") {
      // Archive the previous card — never delete it
      await TemporalCard.findByIdAndUpdate(lastCard._id, {
        status: "superseded",
        supersededAt: now,
        supersededByTrigger: triggerType,
      });

      const card = await TemporalCard.create({
        projectId,
        chainIndex,
        version: lastCard.version + 1,
        category: fragment.category,
        title: synthesis.title,
        summary: synthesis.summary,
        keyChanges: synthesis.key_changes,
        sourceFragment: fragment.raw_text,
        fragmentConfidence: fragment.confidence,
        sourceChatIds: [chatId],
        sourceMessageIds: message
          ? [...(lastCard.sourceMessageIds || []), message.id || message._id]
          : lastCard.sourceMessageIds || [],
        previousCardId: lastCard._id,
        conflictDetected: synthesis.conflict_detected,
        conflictReason: synthesis.conflict_reason || "",
        triggerType,
        configChangesAtTrigger: configChanges || null,
        status: "active",
        expiresAt,
        lastMessageTimestamp: message?.created_at ? new Date(message.created_at) : now,
        kgDiff: {
          add: synthesis.kg_diff?.add || [],
          remove: synthesis.kg_diff?.remove || [],
          edges: synthesis.kg_diff?.edges || [],
          confidence: synthesis.kg_diff?.confidence || 0,
          flushed: false,
        },
        suggestedAction: synthesis.suggested_action || null,
        modelUsed: "llama-3.1-70b-versatile",
      });

      console.log(
        `🃏 [CardWriter] NEW VERSION v${card.version} [${fragment.category}] "${card.title}" ` +
          `(trigger: ${triggerType}, conflict: ${synthesis.conflict_detected})`
      );
      return card;
    }

    // ── CASE 3: Same category, no conflict → UPDATE IN-PLACE ─────────
    const updated = await TemporalCard.findByIdAndUpdate(
      lastCard._id,
      {
        title: synthesis.title,
        summary: synthesis.summary,
        keyChanges: synthesis.key_changes,
        sourceFragment: fragment.raw_text,
        fragmentConfidence: fragment.confidence,
        $addToSet: { sourceMessageIds: message?.id || message?._id },
        expiresAt,
        lastMessageTimestamp: message?.created_at ? new Date(message.created_at) : now,
        kgDiff: {
          add: synthesis.kg_diff?.add || [],
          remove: synthesis.kg_diff?.remove || [],
          edges: synthesis.kg_diff?.edges || [],
          confidence: synthesis.kg_diff?.confidence || 0,
          flushed: false,
        },
        suggestedAction: synthesis.suggested_action || null,
      },
      { new: true }
    );

    console.log(`🃏 [CardWriter] UPDATED in-place [${fragment.category}] "${updated.title}"`);
    return updated;
  }
}

module.exports = { CardWriter };
