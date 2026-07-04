const { ModelRouter } = require("./modelRouter");

class UMLGenerator {
  constructor() {
    this.modelRouter = new ModelRouter();
  }

  /**
   * Generate Mermaid.js code for a specific UML diagram type.
   * @param {string} content - The SRS document content.
   * @param {'usecase' | 'activity' | 'dfd'} type - The type of diagram.
   * @returns {Promise<string>} Mermaid code.
   */
  async generate(content, type) {
    const typeLabel = {
      usecase: "Use Case",
      activity: "Activity",
      dfd: "Data Flow (DFD)"
    }[type] || "General UML";

    const systemPrompt = `You are a professional software architect. 
Your task is to analyze the provided Software Requirements Specification (SRS) and generate a VALID Mermaid.js diagram code for a ${typeLabel} diagram.

RULES:
1. Return ONLY the raw Mermaid.js code.
2. DO NOT include markdown code blocks like \`\`\`mermaid.
3. Ensure the syntax is valid for the latest Mermaid.js version.
4. For DFD, use 'graph TD' or 'flowchart TD'.
5. Focus on the core logic and interactions described in the text.`;

    const userPrompt = `SRS CONTENT:\n${content}\n\nGENERATED ${typeLabel.toUpperCase()} MERMAID CODE:`;

    try {
      let result = await this.modelRouter.callRaw(systemPrompt, userPrompt, {
        temperature: 0.2,
        max_tokens: 3000
      });

      // Cleanup if LLM included code blocks despite instructions
      result = result.replace(/```mermaid/g, "")
                     .replace(/```/g, "")
                     .trim();

      // LLMs frequently emit `A -->|label|> B` — the trailing `>` after the
      // closing pipe is invalid Mermaid and makes the client renderer throw.
      result = result.replace(/\|>(?=\s|$)/gm, "|");

      return result;
    } catch (err) {
      console.error("[UMLGenerator] Generation failed:", err.message);
      throw new Error("Failed to generate UML diagram code.");
    }
  }
}

module.exports = { UMLGenerator };
