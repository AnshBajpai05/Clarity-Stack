// services/modelRouter.js — Multi-provider LLM router with fallback chain
// v4.0: Llama 3.1 70B (Groq) → HuggingFace fallback → Offline regex
const axios = require("axios");

class ModelRouter {
  constructor() {
    this.providers = [
      {
        name: "nvidia-llama-70b",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "meta/llama-3.1-70b-instruct",
        key: process.env.NVIDIA_API_KEY,
        supportsJsonMode: true,
        timeout: 60000,
      },
      {
        name: "hf-70b",
        url: "https://router.huggingface.co/v1/chat/completions",
        model: "meta-llama/Llama-3.3-70B-Instruct",
        key: process.env.HF_TOKEN,
        supportsJsonMode: false,
        timeout: 120000,
      },
    ];
  }

  /**
   * Call LLM with automatic provider failover.
   * Returns parsed JSON object on success.
   */
  async call(systemPrompt, userPrompt, { temperature = 0.1, max_tokens = 2048 } = {}) {
    for (const provider of this.providers) {
      if (!provider.key) {
        console.warn(`[ModelRouter] Skipping ${provider.name} — no API key configured`);
        continue;
      }

      try {
        const body = {
          model: provider.model,
          max_tokens,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        };

        if (provider.supportsJsonMode) {
          body.response_format = { type: "json_object" };
        }

        const res = await axios.post(provider.url, body, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.key}`,
          },
          timeout: provider.timeout,
        });

        const text = res.data.choices[0].message.content;
        const cleaned = text.replace(/```json|```/g, "").trim();

        try {
          return JSON.parse(cleaned);
        } catch (parseErr) {
          // Try extracting JSON from the response
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          console.warn(`[ModelRouter] ${provider.name} returned non-JSON, returning raw`);
          return { raw: cleaned };
        }
      } catch (err) {
        const status = err.response?.status;
        console.warn(
          `[ModelRouter] ${provider.name} failed (${status || err.message}), trying next...`
        );
        if (status === 429 || status === 503 || status === 502 || status === 500) {
          continue;
        }
        // For non-transient errors on non-last provider, still try next
        continue;
      }
    }

    // All providers failed — offline regex fallback
    console.warn("[ModelRouter] All providers failed — using offline parser");
    return this._offlineParse(userPrompt);
  }

  /**
   * Call LLM expecting raw text (not JSON). Used for classification etc.
   */
  async callRaw(systemPrompt, userPrompt, { temperature = 0.1, max_tokens = 50 } = {}) {
    for (const provider of this.providers) {
      if (!provider.key) continue;

      try {
        const res = await axios.post(
          provider.url,
          {
            model: provider.model,
            max_tokens,
            temperature,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${provider.key}`,
            },
            timeout: provider.timeout,
          }
        );

        return res.data.choices[0].message.content.trim();
      } catch (err) {
        console.warn(`[ModelRouter] ${provider.name} raw call failed, trying next...`);
        continue;
      }
    }

    return "";
  }

  /**
   * Offline regex-based fallback parser.
   * Extracts basic structure from the user prompt when all LLMs are unavailable.
   */
  _offlineParse(text) {
    return {
      fragments: [
        {
          id: "f1",
          category: "general",
          raw_text: text.substring(0, 500),
          summary: "Auto-classified (offline mode — LLM unavailable)",
          confidence: 0.3,
          kg_nodes_affected: [],
          key_changes: ["offline-fallback"],
        },
      ],
      total_fragments: 1,
      dominant_category: "general",
    };
  }
}

module.exports = { ModelRouter };
