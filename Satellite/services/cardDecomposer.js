// services/cardDecomposer.js — v4 Message Decomposition via Llama 3.1 70B
// Splits a single message into N independent semantic fragments.

const { DECOMPOSE_SYSTEM, buildDecomposePrompt } = require("./prompts/decompose");

const VALID_CATEGORIES = [
  "risk", "decision", "architecture", "action", "insight",
  "progress", "conflict", "question", "general",
];

class CardDecomposer {
  constructor(modelRouter) {
    this.modelRouter = modelRouter;
  }

  /**
   * Decompose a message into semantic fragments.
   * @param {Object} message - The chat message { text, content, ... }
   * @param {Object} projectContext - { name, techStack }
   * @param {Array}  activeCards - Currently active TemporalCards in this chat
   * @param {Array}  thresholdChanges - Config changes since last run
   * @returns {Array} Array of fragment objects
   */
  async decompose(message, projectContext, activeCards, thresholdChanges = []) {
    const prompt = buildDecomposePrompt(message, projectContext, activeCards, thresholdChanges);

    try {
      const result = await this.modelRouter.call(DECOMPOSE_SYSTEM, prompt);

      if (!result || !result.fragments || !Array.isArray(result.fragments)) {
        console.warn("[CardDecomposer] LLM returned invalid structure, using single-fragment fallback");
        return this._singleFragmentFallback(message);
      }

      // Validate and filter fragments
      const validFragments = result.fragments
        .filter((f) => {
          if (!f.category || !f.raw_text) return false;
          if (f.confidence !== undefined && f.confidence < 0.3) return false;
          return true;
        })
        .map((f, i) => ({
          id: f.id || `f${i + 1}`,
          category: VALID_CATEGORIES.includes(f.category) ? f.category : "general",
          raw_text: f.raw_text,
          summary: f.summary || f.raw_text.substring(0, 100),
          confidence: f.confidence || 0.5,
          kg_nodes_affected: f.kg_nodes_affected || [],
          key_changes: f.key_changes || [],
        }));

      if (validFragments.length === 0) {
        return this._singleFragmentFallback(message);
      }

      console.log(
        `[CardDecomposer] Decomposed into ${validFragments.length} fragments: ${validFragments.map((f) => f.category).join(", ")}`
      );

      return validFragments;
    } catch (err) {
      console.error("[CardDecomposer] Decomposition failed:", err.message);
      return this._singleFragmentFallback(message);
    }
  }

  /**
   * Fallback: treat the entire message as a single general fragment.
   */
  _singleFragmentFallback(message) {
    const text = typeof message === "string" ? message : message.text || message.content || "";
    return [
      {
        id: "f1",
        category: "general",
        raw_text: text.substring(0, 1000),
        summary: text.substring(0, 200),
        confidence: 0.4,
        kg_nodes_affected: [],
        key_changes: [],
      },
    ];
  }
}

module.exports = { CardDecomposer };
