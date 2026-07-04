// routes/kg.js — Knowledge Graph CRUD + Focus Mode
const express = require("express");
const KGSnapshot = require("../models/KGSnapshot");
const { takeSnapshot } = require("../services/deltaEngine");
const { requireAuth, requireProjectAccess, extractToken } = require("../middleware/auth");

const router = express.Router();

// Object-level authZ: every :projectId route is gated on Core membership (§1.3).
router.param("projectId", requireProjectAccess);

/**
 * GET /api/satellite/kg/:projectId
 * Get the latest KG graph (nodes + edges) for a project.
 */
router.get("/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { getConnectionStatus } = require("../config/db");
    if (!getConnectionStatus()) {
      console.log("🔌 DB disconnected, attempting Live-Fetch for KG...");
      const { fetchKGFromCore } = require("../services/deltaEngine");
      
      const token = extractToken(req);
      if (token) {
        const liveData = await fetchKGFromCore(projectId, token);
        return res.json({
          nodes: liveData.nodes,
          edges: liveData.edges,
          version: 0,
          live: true,
          snapshotAt: new Date()
        });
      }
      return res.json({ nodes: [], edges: [], version: 0, error: "Database disconnected and no auth token provided." });
    }

    // Optimized retrieval with a 2-second 'Safety Race'
    // If DB is slow or hanging (common with Atlas IP issues), we pivot to Live-Fetch
    let snapshot = null;
    try {
      // Driver-level deadline (§2.5): maxTimeMS makes Mongo cancel the query server-side
      // when it overruns. The old Promise.race resolved early but left the losing query
      // running, so orphaned queries piled up under the very DB slowness that triggered it.
      snapshot = await KGSnapshot.findOne({ projectId })
        .sort({ snapshotAt: -1 })
        .maxTimeMS(2000)
        .lean();
    } catch (err) {
      const timedOut = err.code === 50 || err.codeName === "MaxTimeMSExpired";
      console.warn(`⚠️ KG Fetch: ${timedOut ? "Database timed out" : "Database error"}. Pivoting to Live-Fetch...`);
    }

    if (!snapshot) {
      const { fetchKGFromCore } = require("../services/deltaEngine");
      const token = extractToken(req);

      if (token) {
        try {
          const liveData = await fetchKGFromCore(projectId, token);
          return res.json({
            nodes: liveData.nodes,
            edges: liveData.edges,
            version: 0,
            live: true,
            snapshotAt: new Date()
          });
        } catch (err) {
          console.error("❌ Live-Fetch fallback failed:", err.message);
        }
      }
      return res.json({ nodes: [], edges: [], version: 0, error: "Database unavailable and live fetch failed." });
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
    const token = extractToken(req);

    const { getConnectionStatus } = require("../config/db");
    if (!getConnectionStatus()) {
      console.log("📸 DB disconnected, returning Live Snapshot without storage.");
      const { fetchKGFromCore } = require("../services/deltaEngine");
      const liveData = await fetchKGFromCore(projectId, token);
      return res.json({ ...liveData, status: "live_only", warning: "Database disconnected - snapshot not saved." });
    }

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
