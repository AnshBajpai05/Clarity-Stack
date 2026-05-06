// models/GraphDelta.js — Computed diff between two KG snapshots
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const DeltaNodeSchema = new mongoose.Schema(
  {
    nodeId: { type: String, required: true },
    section: { type: String, required: true },
    content: { type: String, required: true },
  },
  { _id: false }
);

const DeltaEdgeSchema = new mongoose.Schema(
  {
    edgeId: { type: String, required: true },
    fromNodeId: { type: String, required: true },
    toNodeId: { type: String, required: true },
    relation: { type: String, required: true },
  },
  { _id: false }
);

const GraphDeltaSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    projectId: { type: String, required: true, index: true },
    fromSnapshotId: { type: String, default: null },
    toSnapshotId: { type: String, required: true },

    addedNodes: [DeltaNodeSchema],
    removedNodes: [DeltaNodeSchema],
    addedEdges: [DeltaEdgeSchema],
    removedEdges: [DeltaEdgeSchema],

    // Summary stats
    totalAdded: { type: Number, default: 0 },
    totalRemoved: { type: Number, default: 0 },

    computedAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

GraphDeltaSchema.index({ projectId: 1, computedAt: -1 });

module.exports = mongoose.model("GraphDelta", GraphDeltaSchema);
