// routes/export.js — Output generation (README, UML, PPT)
const express = require("express");
const KGSnapshot = require("../models/KGSnapshot");
const { generateREADME, generateMermaidUML, generatePPTSlides } = require("../services/cardChainer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/satellite/export/:projectId/readme
 * Generate chained README from temporal cards.
 */
router.get("/:projectId/readme", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const token = req.headers.authorization.split(" ")[1];

    const readme = await generateREADME(projectId, token);
    res.send({ content: readme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/satellite/export/:projectId/uml
 * Generate Mermaid UML from the latest KG snapshot.
 */
router.get("/:projectId/uml", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const snapshot = await KGSnapshot.findOne({ projectId })
      .sort({ snapshotAt: -1 })
      .lean();

    const uml = generateMermaidUML(snapshot);
    res.send({ content: uml });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/satellite/export/:projectId/ppt
 * Generate PPT slide deck (Markdown) from temporal cards.
 */
router.get("/:projectId/ppt", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const ppt = await generatePPTSlides(projectId);
    res.send({ content: ppt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
