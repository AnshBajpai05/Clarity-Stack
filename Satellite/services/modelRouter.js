// services/modelRouter.js — Multi-provider LLM router with fallback chain
// v4.1: NVIDIA 405B → Groq 70B → NVIDIA 70B → HF 70B → Offline
const axios = require("axios");
const { gatewayEnabled, gatewayChat } = require("./gatewayClient");

class ModelRouter {
  constructor() {
    this.providers = [
      {
        name: "groq-llama-3.3-70b",
        gw: "groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile",
        key: process.env.GROQ_API_KEY,
        supportsJsonMode: true,
        timeout: 30000,
      },
      {
        name: "nvidia-llama-3.1-70b",
        gw: "nvidia",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        model: "meta/llama-3.1-70b-instruct",
        key: process.env.NVIDIA_API_KEY,
        supportsJsonMode: true,
        timeout: 60000,
      },
      {
        name: "hf-llama-3.3-70b",
        gw: "hf",
        url: "https://router.huggingface.co/v1/chat/completions",
        model: "meta-llama/Llama-3.3-70B-Instruct",
        key: process.env.HF_TOKEN,
        supportsJsonMode: false,
        timeout: 60000,
      }
    ];
  }

  /** Parse an LLM text response into an object (strips ```json fences; regex-rescues). */
  _parseJson(text, label = "gateway") {
    const cleaned = String(text).replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch (_) {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      console.warn(`[ModelRouter] ⚠️  ${label} non-JSON output.`);
      return { raw: cleaned };
    }
  }

  async call(systemPrompt, userPrompt, { temperature = 0.1, max_tokens = 2048 } = {}) {
    const now = Date.now();

    // §10.2: prefer the central Clarity gateway — pass the whole provider list as an
    // ordered fallback chain so the gateway's breaker/cache/budget govern the call.
    // On any gateway failure, fall through to the direct per-provider loop below.
    if (gatewayEnabled()) {
      try {
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ];
        const candidates = this.providers.map((p) => ({ provider: p.gw, model: p.model }));
        const content = await gatewayChat(messages, {
          candidates, temperature, max_tokens,
          response_format: { type: "json_object" }, tags: "satellite-router",
        });
        console.log("[ModelRouter] ✅ via central gateway.");
        return this._parseJson(content, "gateway");
      } catch (err) {
        console.warn(`[ModelRouter] ⚠️  gateway failed (${err.message}); using direct providers...`);
      }
    }

    for (const provider of this.providers) {
      if (!provider.key) continue;

      if (provider.brokenUntil && now < provider.brokenUntil) {
        console.log(`[ModelRouter] ⏳ ${provider.name} in cooldown...`);
        continue;
      }

      try {
        console.log(`[ModelRouter] 🤖 Calling ${provider.name}...`);
        
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

        // Safety check for response structure
        if (!res.data?.choices?.[0]?.message?.content) {
          throw new Error(`Invalid response structure from ${provider.name}`);
        }

        const text = res.data.choices[0].message.content;
        const cleaned = text.replace(/```json|```/g, "").trim();

        try {
          const parsed = JSON.parse(cleaned);
          console.log(`[ModelRouter] ✅ ${provider.name} success.`);
          return parsed;
        } catch (parseErr) {
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log(`[ModelRouter] ✅ ${provider.name} success (regex parsed).`);
            return JSON.parse(jsonMatch[0]);
          }
          console.warn(`[ModelRouter] ⚠️  ${provider.name} non-JSON output.`);
          return { raw: cleaned };
        }
      } catch (err) {
        const status = err.response?.status;
        console.warn(`[ModelRouter] ❌ ${provider.name} failed: ${err.message} (${status || "No Status"})`);
        
        if (status === 400 || status === 401 || status === 403 || status === 429) {
          provider.brokenUntil = now + 5 * 60 * 1000; // 5 min cooldown
        }
        continue;
      }
    }

    console.warn("[ModelRouter] 🚨 ALL PROVIDERS FAILED — Falling back to offline mode.");
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
