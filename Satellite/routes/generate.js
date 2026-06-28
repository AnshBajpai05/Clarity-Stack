const express = require("express");
const router = express.Router();
const { UMLGenerator } = require("../services/umlGenerator");
const { requireAuth } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const umlGenerator = new UMLGenerator();

// POST /api/satellite/generate/uml — auth + rate limit (§5.6: paid LLM endpoint)
router.post("/uml", requireAuth, rateLimit(20, 60000, "uml"), async (req, res) => {
  const { content, type } = req.body;

  if (!content) {
    return res.status(400).json({ error: "Missing content for UML generation" });
  }

  if (!['usecase', 'activity', 'dfd'].includes(type)) {
    return res.status(400).json({ error: "Invalid diagram type. Must be 'usecase', 'activity', or 'dfd'." });
  }

  try {
    const mermaid = await umlGenerator.generate(content, type);
    res.json({ mermaid });
  } catch (error) {
    console.error(`[GenerateRoute] UML error: ${error.message}`);
    res.status(500).json({ error: "UML generation failed. Please try again later." });
  }
});

module.exports = router;
