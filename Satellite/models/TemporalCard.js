// models/TemporalCard.js — AI-generated summary cards with temporal logic
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const TemporalCardSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    projectId: { type: String, required: true, index: true },
    deltaId: { type: String, default: null },

    // Card content
    title: { type: String, required: true },
    summary: { type: String, required: true },
    keyChanges: [{ type: String }],

    // ─── Card label / category ───────────────────────────────────
    label: {
      type: String,
      enum: ["risk", "decision", "architecture", "progress", "conflict", "general"],
      default: "general",
      index: true,
    },

    // ─── Version tracking ────────────────────────────────────────
    // Same label can have multiple versions; latest version is the "active" one
    version: { type: Number, default: 1 },
    previousVersionId: { type: String, default: null },

    // ─── Source tracking ─────────────────────────────────────────
    sourceType: {
      type: String,
      enum: ["chat", "delta", "kg_update", "manual", "auto_refresh"],
      default: "chat",
    },
    sourceMessageIds: [{ type: String }],   // message IDs used to generate
    sourceChatIds: [{ type: String }],       // chat IDs used

    // ─── Temporal expiration ─────────────────────────────────────
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + THREE_DAYS_MS),
      index: true,
    },
    expired: { type: Boolean, default: false },

    // ─── KG impact ───────────────────────────────────────────────
    kgNodesAdded: [{ type: String }],
    kgNodesRemoved: [{ type: String }],
    kgUpdated: { type: Boolean, default: false },

    // AI metadata
    generatedBy: { type: String, default: "meta-llama/Llama-3.3-70B-Instruct" },
    promptUsed: { type: String, default: null },

    // Chain tracking — sequential cards per project
    chainIndex: { type: Number, required: true, default: 0 },
    parentCardId: { type: String, default: null },

    // Status
    status: {
      type: String,
      enum: ["draft", "approved", "archived"],
      default: "draft",
    },

    // Supabase future-proofing
    supabase_ref: { type: String, default: null },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

TemporalCardSchema.index({ projectId: 1, chainIndex: 1 });
TemporalCardSchema.index({ projectId: 1, label: 1, version: -1 });
TemporalCardSchema.index({ expired: 1, expiresAt: 1 });

module.exports = mongoose.model("TemporalCard", TemporalCardSchema);
