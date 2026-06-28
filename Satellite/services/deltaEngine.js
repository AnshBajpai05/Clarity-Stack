// services/deltaEngine.js — 3-day KG diff computation
const axios = require("axios");
const KGSnapshot = require("../models/KGSnapshot");
const GraphDelta = require("../models/GraphDelta");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";

/**
 * Fetch all KG nodes and edges for a project from the core API.
 * Aggregates across all chats in the project.
 */
async function fetchKGFromCore(projectId, token) {
  try {
    // 1. Get all chats for this project
    const chatsRes = await axios.get(`${CORE_API}/projects/${projectId}/chats`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });

    const chats = chatsRes.data || [];
    const allNodes = [];
    const allEdges = [];

    // 2. For each chat, get the reasoning data (nodes + edges)
    for (const chat of chats) {
      try {
        const reasoningRes = await axios.get(
          `${CORE_API}/api/reasoning/chat/${chat.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000,
          }
        );

        const data = reasoningRes.data;

        // Collect decision nodes
        if (data.decision) {
          for (const node of data.decision) {
            allNodes.push({
              nodeId: node.id,
              section: node.section || "DECISION",
              content: node.content,
              confidence: node.confidence,
              chatId: chat.id,
              synthesisId: node.synthesis_id,
            });
          }
        }

        // Collect supporting facts
        if (data.supports) {
          for (const node of data.supports) {
            allNodes.push({
              nodeId: node.id,
              section: node.section || "FACT",
              content: node.content,
              confidence: node.confidence,
              chatId: chat.id,
              synthesisId: node.synthesis_id,
            });
          }
        }

        // Collect conflicts
        if (data.conflicts) {
          for (const node of data.conflicts) {
            allNodes.push({
              nodeId: node.id,
              section: node.section || "CONFLICT",
              content: node.content,
              confidence: node.confidence,
              chatId: chat.id,
              synthesisId: node.synthesis_id,
            });
          }
        }

        // Collect blockers
        if (data.blockers) {
          for (const node of data.blockers) {
            allNodes.push({
              nodeId: node.id,
              section: node.section || "UNKNOWN",
              content: node.content,
              confidence: node.confidence,
              chatId: chat.id,
              synthesisId: node.synthesis_id,
            });
          }
        }

        // Collect others (Assumption, Constraint, etc.)
        if (data.others) {
          for (const node of data.others) {
            allNodes.push({
              nodeId: node.id,
              section: node.section || "UNKNOWN",
              content: node.content,
              confidence: node.confidence,
              chatId: chat.id,
              synthesisId: node.synthesis_id,
            });
          }
        }

        // 🔗 COLLECT EDGES
        if (data.edges) {
          for (const edge of data.edges) {
            allEdges.push({
              edgeId: edge.id,
              fromNodeId: edge.from_node_id,
              toNodeId: edge.to_node_id,
              relation: edge.relation,
              chatId: chat.id,
            });
          }
        }
      } catch (chatErr) {
        console.warn(`⚠️  Failed to fetch reasoning for chat ${chat.id}:`, chatErr.message);
      }
    }

    // Deduplicate nodes by nodeId
    const uniqueNodes = [];
    const seenNodeIds = new Set();
    for (const node of allNodes) {
      if (!seenNodeIds.has(node.nodeId)) {
        seenNodeIds.add(node.nodeId);
        uniqueNodes.push(node);
      }
    }

    return { nodes: uniqueNodes, edges: allEdges };
  } catch (err) {
    console.error("❌ Failed to fetch KG from core:", err.message);
    throw err;
  }
}

/**
 * Take a snapshot of the current KG state.
 */
async function takeSnapshot(projectId, token) {
  const { nodes, edges } = await fetchKGFromCore(projectId, token);

  const snapshot = await KGSnapshot.create({
    projectId,
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  console.log(`📸 Snapshot taken: ${nodes.length} nodes, ${edges.length} edges`);
  return snapshot;
}

/**
 * Stable key for an edge (§11.2). Edge ids coming from Core can be missing; keying
 * a Set directly on `edgeId` would collapse every id-less edge to a single
 * `undefined` bucket and silently corrupt the diff. Fall back to a composite of the
 * endpoints + relation so distinct edges stay distinct.
 */
function edgeKey(e) {
  return e.edgeId != null
    ? `id:${e.edgeId}`
    : `pair:${e.fromNodeId}->${e.toNodeId}:${e.relation ?? ""}`;
}

/**
 * Compute the delta between two snapshots.
 * If no "from" snapshot, the delta is everything in the "to" snapshot.
 */
function computeDiff(fromSnapshot, toSnapshot) {
  const fromNodeIds = new Set((fromSnapshot?.nodes || []).map((n) => n.nodeId));
  const toNodeIds = new Set((toSnapshot?.nodes || []).map((n) => n.nodeId));

  const fromEdgeKeys = new Set((fromSnapshot?.edges || []).map(edgeKey));
  const toEdgeKeys = new Set((toSnapshot?.edges || []).map(edgeKey));

  const addedNodes = (toSnapshot.nodes || []).filter((n) => !fromNodeIds.has(n.nodeId));
  const removedNodes = (fromSnapshot?.nodes || []).filter((n) => !toNodeIds.has(n.nodeId));

  const addedEdges = (toSnapshot.edges || []).filter((e) => !fromEdgeKeys.has(edgeKey(e)));
  const removedEdges = (fromSnapshot?.edges || []).filter((e) => !toEdgeKeys.has(edgeKey(e)));

  return { addedNodes, removedNodes, addedEdges, removedEdges };
}

/**
 * Compute a full delta for a project: snapshot now, diff against last snapshot.
 */
async function computeDelta(projectId, token) {
  // 1. Take fresh snapshot
  const newSnapshot = await takeSnapshot(projectId, token);

  // 2. Find previous snapshot (before this one)
  const prevSnapshot = await KGSnapshot.findOne({
    projectId,
    _id: { $ne: newSnapshot._id },
  }).sort({ snapshotAt: -1 });

  // 3. Compute diff
  const diff = computeDiff(prevSnapshot, newSnapshot);

  // 4. Store delta
  const delta = await GraphDelta.create({
    projectId,
    fromSnapshotId: prevSnapshot?._id || null,
    toSnapshotId: newSnapshot._id,
    addedNodes: diff.addedNodes,
    removedNodes: diff.removedNodes,
    addedEdges: diff.addedEdges,
    removedEdges: diff.removedEdges,
    totalAdded: diff.addedNodes.length + diff.addedEdges.length,
    totalRemoved: diff.removedNodes.length + diff.removedEdges.length,
  });

  console.log(
    `📊 Delta computed: +${delta.totalAdded} / -${delta.totalRemoved}`
  );
  return delta;
}

module.exports = { fetchKGFromCore, takeSnapshot, computeDiff, computeDelta };
