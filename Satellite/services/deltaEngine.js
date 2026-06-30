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
 * §16.3 fix — diff by CONTENT, not by UUID.
 *
 * Core re-mints a fresh node UUID for every claim on every `/ask` and is append-only,
 * so keying the diff on `nodeId` made an identical, re-stated decision look brand-new
 * each time (inflating "+N") while nothing ever matched the old ids to count as
 * "removed". The timeline measured *that an ask happened*, not *how the thinking
 * evolved*. Keying on normalized content collapses those UUID restatements: "added"
 * now means genuinely new content entered the project, and a re-asked-but-unchanged
 * decision contributes nothing.
 */
function normContent(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")        // collapse whitespace
    .replace(/[.,;:!?]+$/g, "")  // drop trailing punctuation
    .trim();
}

// Section-scoped content identity: the same text under FACT vs DECISION is distinct.
function nodeContentKey(n) {
  return `${String(n.section || "").toUpperCase()}::${normContent(n.content)}`;
}

// An edge's identity is the MEANING of its endpoints + relation, not their churned
// UUIDs. Resolve each endpoint to its node content key (falling back to the raw id
// when the endpoint node isn't in the snapshot's node set) so edges stop churning too.
function edgeContentKey(e, nodeKeyById) {
  const from = nodeKeyById.get(e.fromNodeId) || `id:${e.fromNodeId}`;
  const to = nodeKeyById.get(e.toNodeId) || `id:${e.toNodeId}`;
  return `${from}|${e.relation ?? ""}|${to}`;
}

// Map nodeId -> content key for one snapshot (used to resolve edge endpoints).
function nodeKeyIndex(snapshot) {
  const m = new Map();
  for (const n of snapshot?.nodes || []) m.set(n.nodeId, nodeContentKey(n));
  return m;
}

// Keep ONE representative item per content key (first seen), so duplicate restatements
// within the same window don't double-count and "+N" stays a count of distinct ideas.
function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = keyFn(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/**
 * Compute the delta between two snapshots, by content (see §16.3 note above).
 * If no "from" snapshot, the delta is everything (deduped) in the "to" snapshot.
 */
function computeDiff(fromSnapshot, toSnapshot) {
  const fromNodeKeys = new Set((fromSnapshot?.nodes || []).map(nodeContentKey));
  const toNodeKeys = new Set((toSnapshot?.nodes || []).map(nodeContentKey));

  const fromIndex = nodeKeyIndex(fromSnapshot);
  const toIndex = nodeKeyIndex(toSnapshot);
  const fromEdgeKeys = new Set((fromSnapshot?.edges || []).map((e) => edgeContentKey(e, fromIndex)));
  const toEdgeKeys = new Set((toSnapshot?.edges || []).map((e) => edgeContentKey(e, toIndex)));

  const addedNodes = dedupeByKey(
    (toSnapshot.nodes || []).filter((n) => !fromNodeKeys.has(nodeContentKey(n))),
    nodeContentKey
  );
  const removedNodes = dedupeByKey(
    (fromSnapshot?.nodes || []).filter((n) => !toNodeKeys.has(nodeContentKey(n))),
    nodeContentKey
  );

  const addedEdges = dedupeByKey(
    (toSnapshot.edges || []).filter((e) => !fromEdgeKeys.has(edgeContentKey(e, toIndex))),
    (e) => edgeContentKey(e, toIndex)
  );
  const removedEdges = dedupeByKey(
    (fromSnapshot?.edges || []).filter((e) => !toEdgeKeys.has(edgeContentKey(e, fromIndex))),
    (e) => edgeContentKey(e, fromIndex)
  );

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

module.exports = {
  fetchKGFromCore, takeSnapshot, computeDiff, computeDelta,
  // exported for unit tests (§16.3 content-hash diff)
  normContent, nodeContentKey, edgeContentKey,
};
