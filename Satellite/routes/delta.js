// routes/delta.js — Graph Delta engine routes
const express = require("express");
const GraphDelta = require("../models/GraphDelta");
const { computeDelta } = require("../services/deltaEngine");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/satellite/delta/:projectId
 * List all deltas for a project, sorted by newest first.
 */
router.get("/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const deltas = await GraphDelta.find({ projectId })
      .sort({ computedAt: -1 })
      .lean();

    res.json(deltas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/satellite/delta/:projectId/compute
 * Force-compute a new delta now.
 */
router.post("/:projectId/compute", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const token = req.headers.authorization.split(" ")[1];

    const delta = await computeDelta(projectId, token);
    res.json(delta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/satellite/delta/:projectId/latest
 * Get the most recent delta.
 */
router.get("/:projectId/latest", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const delta = await GraphDelta.findOne({ projectId })
      .sort({ computedAt: -1 })
      .lean();

    if (!delta) {
      return res.json(null);
    }

    res.json(delta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
