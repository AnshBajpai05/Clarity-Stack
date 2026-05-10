// services/cardSynthesizer.js — v4 Card Synthesis via Llama 3.1 70B
// Takes a fragment + last card content → produces a synthesized card with conflict detection.

const { SYNTH_SYSTEM, buildSynthPrompt } = require("./prompts/synthesize");

class CardSynthesizer {
  constructor(modelRouter) {
    this.modelRouter = modelRouter;
  }

  /**
   * Synthesize a card from a fragment and the last card's content.
   * @param {Object} fragment - Decomposed fragment { category, raw_text, summary, ... }
   * @param {Object|null} lastCard - Previous active card for this category (null = first card)
   * @param {string} triggerType - "new_message" | "threshold_change" | "conflict"
   * @param {Object|null} configChanges - Config changes that triggered this (if threshold_change)
   * @returns {Object} Synthesis result { title, summary, key_changes, conflict_detected, ... }
   */
  async synthesize(fragment, lastCard, triggerType = "new_message", configChanges = null) {
    const prompt = buildSynthPrompt(fragment, lastCard, triggerType, configChanges);

    try {
      const result = await this.modelRouter.call(SYNTH_SYSTEM, prompt);

      // Validate and normalize the result
      return {
        title: result.title || `${fragment.category} Update`,
        summary: result.summary || fragment.summary || fragment.raw_text.substring(0, 200),
        key_changes: Array.isArray(result.key_changes)
          ? result.key_changes
          : fragment.key_changes || [],
        conflict_detected: Boolean(result.conflict_detected),
        conflict_reason: result.conflict_reason || "",
        trigger_type: result.trigger_type || triggerType,
        kg_diff: this._normalizeKGDiff(result.kg_diff),
        suggested_action: result.suggested_action || null,
      };
    } catch (err) {
      console.error("[CardSynthesizer] Synthesis failed:", err.message);
      // Fallback: use fragment directly
      return {
        title: `${fragment.category.charAt(0).toUpperCase() + fragment.category.slice(1)} Update`,
        summary: fragment.summary || fragment.raw_text.substring(0, 200),
        key_changes: fragment.key_changes || [],
        conflict_detected: false,
        conflict_reason: "",
        trigger_type: triggerType,
        kg_diff: { add: [], remove: [], edges: [], confidence: 0.3 },
        suggested_action: null,
      };
    }
  }

  /**
   * Normalize the KG diff from LLM output to ensure consistent schema.
   */
  _normalizeKGDiff(diff) {
    if (!diff || typeof diff !== "object") {
      return { add: [], remove: [], edges: [], confidence: 0.3 };
    }

    return {
      add: Array.isArray(diff.add)
        ? diff.add.map((n) => ({
            id: n.id || n.label?.toLowerCase().replace(/\s+/g, "_") || "unknown",
            label: n.label || "Unknown",
            type: n.type || "concept",
          }))
        : [],
      remove: Array.isArray(diff.remove) ? diff.remove : [],
      edges: Array.isArray(diff.edges)
        ? diff.edges.map((e) => ({
            from: e.from || "",
            to: e.to || "",
            label: e.label || "related_to",
          }))
        : [],
      confidence: typeof diff.confidence === "number" ? diff.confidence : 0.5,
    };
  }
}

module.exports = { CardSynthesizer };
