// models/KGSnapshot.js — Knowledge Graph state snapshot
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const KGNodeSchema = new mongoose.Schema(
  {
    nodeId: { type: String, required: true },
    section: {
      type: String,
      enum: ["FACT", "CONSTRAINT", "ASSUMPTION", "OPTION", "DECISION", "CONFLICT", "UNKNOWN", "CONFIDENCE", "EXAMPLE"],
      required: true,
    },
    content: { type: String, required: true },
    confidence: { type: Number, default: null },
    chatId: { type: String, required: true },
    synthesisId: { type: String, default: null },
  },
  { _id: false }
);

const KGEdgeSchema = new mongoose.Schema(
  {
    edgeId: { type: String, required: true },
    fromNodeId: { type: String, required: true },
    toNodeId: { type: String, required: true },
    relation: {
      type: String,
      enum: ["SUPPORTS", "CONTRADICTS", "REFINES", "DEPENDS_ON", "BLOCKS", "ALTERNATIVE_OF"],
      required: true,
    },
    chatId: { type: String, required: true },
  },
  { _id: false }
);

const KGSnapshotSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    projectId: { type: String, required: true, index: true },
    nodes: [KGNodeSchema],
    edges: [KGEdgeSchema],
    nodeCount: { type: Number, default: 0 },
    edgeCount: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    snapshotAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient delta queries
KGSnapshotSchema.index({ projectId: 1, snapshotAt: -1 });

module.exports = mongoose.model("KGSnapshot", KGSnapshotSchema);
