const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const TemporalCard = require("../models/TemporalCard");
const GraphDelta = require("../models/GraphDelta");
const KGSnapshot = require("../models/KGSnapshot");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is not set. Satellite refuses to boot (fail-closed). " +
    "Set it (matching the Core Backend's value) in Satellite/.env."
  );
}

// Internal auth middleware
function requireInternalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing internal token" });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "internal") {
      return res.status(403).json({ error: "Insufficient internal permissions" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid internal token" });
  }
}

// POST /api/satellite/internal/cleanup
router.post("/cleanup", requireInternalAuth, async (req, res) => {
  const { scope, id } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Missing target ID" });
  }

  try {
    let result = { temporalCards: 0, graphDeltas: 0, kgSnapshots: 0 };

    if (scope === "project") {
      // Wipe everything related to the project
      const delCards = await TemporalCard.deleteMany({ projectId: id });
      const delDeltas = await GraphDelta.deleteMany({ projectId: id });
      const delSnaps = await KGSnapshot.deleteMany({ projectId: id });

      result.temporalCards = delCards.deletedCount;
      result.graphDeltas = delDeltas.deletedCount;
      result.kgSnapshots = delSnaps.deletedCount;
      
    } else if (scope === "chat") {
      // Wipe cards that were sourced from this chat
      const delCards = await TemporalCard.deleteMany({ sourceChatIds: id });
      result.temporalCards = delCards.deletedCount;
      // GraphDelta and KGSnapshot do not have chat tracking, so we only clean cards.
    } else {
      return res.status(400).json({ error: "Invalid scope (must be 'project' or 'chat')" });
    }

    console.log(`[Internal] Cleanup for ${scope} ${id}: deleted ${JSON.stringify(result)}`);
    return res.json({ status: "success", scope, id, deleted: result });

  } catch (error) {
    console.error(`[Internal] Error during cleanup: ${error.message}`);
    return res.status(500).json({ error: "Failed to run cleanup" });
  }
});

module.exports = router;
