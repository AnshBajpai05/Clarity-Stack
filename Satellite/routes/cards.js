// routes/cards.js — v4 Temporal Card routes
// Adds: card history endpoint, category-based queries, v4 pipeline trigger
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
  getCardsByCategory,
  getCardHistory,
  getExpiredCards,
} = require("../services/cardChainer");
const { requireAuth, requireProjectAccess, requireCardAccess } = require("../middleware/auth");
const { rateLimit } = require("../middleware/rateLimit");

const router = express.Router();

// Object-level authZ (§1.3): gate every :projectId route on Core membership, and
// every :cardId route on the card's own project (blocks cross-tenant card access,
// incl. the previously-public GETs and the DELETE /:cardId route).
router.param("projectId", requireProjectAccess);
router.param("cardId", requireCardAccess);

// ─── GET /api/satellite/cards/:projectId ────────────────────────────────────
// Get all temporal cards for a project, chained in order.
router.get("/:projectId", async (req, res) => {
  try {
    const { getConnectionStatus } = require("../config/db");
    if (!getConnectionStatus()) {
      return res.json([]); // Return empty list if DB is down
    }
    const cards = await getChainedCards(req.params.projectId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/satellite/cards/:projectId/label/:label ───────────────────────
// Get all versions of a specific label/category card.
router.get("/:projectId/label/:label", async (req, res) => {
  try {
    const { projectId, label } = req.params;
    const validLabels = [
      "risk", "decision", "architecture", "action", "insight",
      "progress", "conflict", "question", "general",
    ];
    if (!validLabels.includes(label)) {
      return res.status(400).json({ error: `Invalid label. Valid: ${validLabels.join(", ")}` });
    }
    const cards = await getCardsByCategory(projectId, label);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/satellite/cards/:projectId/expired ────────────────────────────
// Get stale/expired cards.
router.get("/:projectId/expired", requireAuth, async (req, res) => {
  try {
    const cards = await getExpiredCards(req.params.projectId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/satellite/cards/:projectId/history/:cardId ────────────────────
// Get the full version history chain for a card.
router.get("/:projectId/history/:cardId", requireAuth, async (req, res) => {
  try {
    const history = await getCardHistory(req.params.cardId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/generate ──────────────────────────
// Legacy: Generate from latest delta.
router.post("/:projectId/generate", requireAuth, rateLimit(15, 60000, "cards-generate"), async (req, res) => {
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
// v4: Generate cards from a specific chat (one message → N cards).
router.post("/:projectId/generate/chat/:chatId", requireAuth, rateLimit(15, 60000, "cards-generate-chat"), async (req, res) => {
  try {
    const { projectId, chatId } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const cards = await generateCardFromChat(projectId, chatId, token);
    res.json({ cards, count: cards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/generate/label/:label ─────────────
// v4: Generate cards for a specific category from all project messages.
router.post("/:projectId/generate/label/:label", requireAuth, rateLimit(15, 60000, "cards-generate-label"), async (req, res) => {
  try {
    const { projectId, label } = req.params;
    const token = req.headers.authorization?.split(" ")[1];

    const validLabels = [
      "risk", "decision", "architecture", "action", "insight",
      "progress", "conflict", "question", "general",
    ];
    if (!validLabels.includes(label)) {
      return res.status(400).json({ error: `Invalid label. Valid: ${validLabels.join(", ")}` });
    }

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const cards = await generateCardByLabel(projectId, label, token);
    res.json({ cards, count: cards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/auto-generate ─────────────────────
// Trigger the auto-generation check (scheduler-style).
router.post("/:projectId/auto-generate", requireAuth, rateLimit(10, 60000, "cards-auto-generate"), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { force } = req.body;
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    const result = await autoGenerateCards(projectId, token, !!force);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/satellite/cards/:projectId/:cardId/refresh ───────────────────
// Refresh a stale card (creates a new version).
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
// Manually flush KG diff for this card.
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

// ── Helper: walk the version chain forward to find the current active head ────
async function findActiveHead(fromCardId) {
  let cursor = fromCardId;
  // Walk forward at most 20 steps — prevents infinite loop on corrupt chains
  for (let i = 0; i < 20; i++) {
    const next = await TemporalCard.findOne({ previousCardId: cursor });
    if (!next) break;
    if (next.status === "active") return next;
    cursor = next._id;
  }
  return null;
}

// ── PUT /api/satellite/cards/:projectId/:cardId/edit ───────────────────────
router.put("/:projectId/:cardId/edit", requireAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { title, summary, version } = req.body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!title?.trim() || !summary?.trim()) {
      return res.status(400).json({ error: "title and summary are required." });
    }
    if (version === undefined || version === null) {
      return res.status(400).json({ error: "version is required for edit operations." });
    }

    const incomingVersion = parseInt(version, 10);
    if (isNaN(incomingVersion)) {
      return res.status(400).json({ error: "version must be a valid integer." });
    }

    // ── Atomic supersede: only succeeds if card is still active AND version matches ──
    // If two users submit simultaneously, exactly one wins this update.
    const superseded = await TemporalCard.findOneAndUpdate(
      { _id: cardId, status: "active", version: incomingVersion },
      { $set: { status: "superseded", supersededAt: new Date() } },
      { new: false }  // return the original pre-update document
    );

    // ── Conflict / not-found handling ────────────────────────────────────────
    if (!superseded) {
      // Distinguish between "card never existed" and "version conflict"
      const exists = await TemporalCard.findById(cardId).select("_id status version").lean();

      if (!exists) {
        return res.status(404).json({ error: "Card not found." });
      }

      // Card exists but atomic update failed — version mismatch or already superseded
      // Walk the chain forward to find what the card evolved into
      const activeHead = await findActiveHead(cardId);

      return res.status(409).json({
        error: "conflict",
        message: "This card evolved while you were editing it. Review the current version before saving.",
        your_version: incomingVersion,
        current_version: activeHead?.version ?? null,
        current_active_card: activeHead ?? null,
      });
    }

    // ── Atomic update succeeded — we hold the lock, create the new version ───
    const nextVersion = superseded.version + 1;

    const evolved = await TemporalCard.create({
      ...superseded.toObject(),
      _id:            undefined,          // Mongo assigns new _id
      title:          title.trim(),
      summary:        summary.trim(),
      version:        nextVersion,
      previousCardId: superseded._id,
      status:         "active",
      supersededAt:   undefined,          // new card is not superseded
      createdAt:      new Date(),
      updatedAt:      new Date(),
      kgDiff: {                           // reset KG diff — new version needs fresh delta
        add: [], remove: [], edges: [],
        confidence: 0, flushed: false,
      },
    });

    console.log(
      `[Cards] Evolved card ${superseded._id} v${superseded.version} → ${evolved._id} v${nextVersion}`
    );

    return res.status(201).json(evolved);

  } catch (err) {
    console.error("[Cards] Edit route error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/satellite/cards/:cardId ────────────────────────────────────
// Delete a specific temporal card.
router.delete("/:cardId", requireAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const result = await TemporalCard.findByIdAndDelete(cardId);
    if (!result) {
      return res.status(404).json({ error: "Card not found" });
    }
    res.json({ message: "Card deleted successfully", cardId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
