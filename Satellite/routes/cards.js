// routes/cards.js — Temporal Card routes (v2)
const express = require("express");
const TemporalCard = require("../models/TemporalCard");
const GraphDelta = require("../models/GraphDelta");
const {
  generateCardFromDelta,
  generateCardFromChat,
  generateCardByLabel,
  autoGenerateCards,
  refreshCard,
  updateKGFromCard,
  getChainedCards,
  getCardsByLabel,
  getExpiredCards,
} = require("../services/cardChainer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ─── GET /api/satellite/cards/:projectId ────────────────────────────────────
// Get all temporal cards for a project, chained in order.
router.get("/:projectId", requireAuth, async (req, res) => {
  try {
    const cards = await getChainedCards(req.params.projectId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/satellite/cards/:projectId/label/:label ───────────────────────
// Get all versions of a specific label card.
router.get("/:projectId/label/:label", requireAuth, async (req, res) => {
  try {
    const { projectId, label } = req.params;
    const validLabels = ["risk", "decision", "architecture", "progress", "conflict", "general"];
    if (!validLabels.includes(label)) {
      return res.status(400).json({ error: `Invalid label. Valid: ${validLabels.join(", ")}` });
    }
    const cards = await getCardsByLabel(projectId, label);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/satellite/cards/:projectId/expired ────────────────────────────
// Get expired cards.
router.get("/:projectId/expired", requireAuth, async (req, res) => {
  try {
    const cards = await getExpiredCards(req.params.projectId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/generate ──────────────────────────
// Legacy: Generate from latest delta.
router.post("/:projectId/generate", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const latestDelta = await GraphDelta.findOne({ projectId })
      .sort({ computedAt: -1 })
      .lean();

    if (!latestDelta) {
      return res.status(400).json({ error: "No deltas exist. Compute a delta first." });
    }

    const existing = await TemporalCard.findOne({ deltaId: latestDelta._id });
    if (existing) {
      return res.status(400).json({ error: "Card already exists for the latest delta." });
    }

    const card = await generateCardFromDelta(projectId, latestDelta);
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/generate/chat/:chatId ─────────────
// Generate a card from a specific chat's messages.
router.post("/:projectId/generate/chat/:chatId", requireAuth, async (req, res) => {
  try {
    const { projectId, chatId } = req.params;
    const { label } = req.body || {};
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const card = await generateCardFromChat(projectId, chatId, token, label || null);
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/generate/label/:label ─────────────
// Generate a new version of a labeled card from all project messages.
router.post("/:projectId/generate/label/:label", requireAuth, async (req, res) => {
  try {
    const { projectId, label } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    const validLabels = ["risk", "decision", "architecture", "progress", "conflict", "general"];
    if (!validLabels.includes(label)) {
      return res.status(400).json({ error: `Invalid label. Valid: ${validLabels.join(", ")}` });
    }

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const card = await generateCardByLabel(projectId, label, token);
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/auto-generate ─────────────────────
// Trigger the 3-day auto-generation check.
router.post("/:projectId/auto-generate", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const result = await autoGenerateCards(projectId, token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/:cardId/refresh ───────────────────
// Refresh an expired card (creates a new version).
router.post("/:projectId/:cardId/refresh", requireAuth, async (req, res) => {
  try {
    const { projectId, cardId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const card = await refreshCard(projectId, cardId, token);
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/:cardId/update-kg ─────────────────
// Apply this card's KG suggestions to the Knowledge Graph.
router.post("/:projectId/:cardId/update-kg", requireAuth, async (req, res) => {
  try {
    const { projectId, cardId } = req.params;

    const card = await TemporalCard.findById(cardId).lean();
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    const result = await updateKGFromCard(projectId, card);
    res.json({ message: "KG updated", ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
