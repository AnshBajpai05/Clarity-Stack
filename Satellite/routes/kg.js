// routes/kg.js — Knowledge Graph CRUD + Focus Mode
const express = require("express");
const KGSnapshot = require("../models/KGSnapshot");
const { takeSnapshot } = require("../services/deltaEngine");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * GET /api/satellite/kg/:projectId
 * Get the latest KG graph (nodes + edges) for a project.
 */
router.get("/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const snapshot = await KGSnapshot.findOne({ projectId })
      .sort({ snapshotAt: -1 })
      .lean();

    if (!snapshot) {
      return res.json({ nodes: [], edges: [], version: 0 });
    }

    res.json({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      version: snapshot.version,
      snapshotAt: snapshot.snapshotAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/satellite/kg/:projectId/snapshot
 * Trigger a manual KG snapshot from the core API.
 */
router.post("/:projectId/snapshot", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    // Extract token to pass to core API
    const token = req.headers.authorization.split(" ")[1];

    const snapshot = await takeSnapshot(projectId, token);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/satellite/kg/:projectId/focus/:nodeId
 * Focus Mode: returns only the subgraph connected to nodeId.
 */
router.get("/:projectId/focus/:nodeId", requireAuth, async (req, res) => {
  try {
    const { projectId, nodeId } = req.params;

    const snapshot = await KGSnapshot.findOne({ projectId })
      .sort({ snapshotAt: -1 })
      .lean();

    if (!snapshot) {
      return res.json({ nodes: [], edges: [] });
    }

    // Find edges connected to the node
    const connectedEdges = snapshot.edges.filter(
      (e) => e.fromNodeId === nodeId || e.toNodeId === nodeId
    );

    // Collect all node IDs in the subgraph
    const connectedNodeIds = new Set([nodeId]);
    connectedEdges.forEach((e) => {
      connectedNodeIds.add(e.fromNodeId);
      connectedNodeIds.add(e.toNodeId);
    });

    // Filter nodes
    const connectedNodes = snapshot.nodes.filter((n) =>
      connectedNodeIds.has(n.nodeId)
    );

    res.json({
      nodes: connectedNodes,
      edges: connectedEdges,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
