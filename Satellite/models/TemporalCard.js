// models/TemporalCard.js — v4 Schema: Multi-category, version chaining, KG diff embedded
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const TemporalCardSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    projectId: { type: String, required: true, index: true },
    deltaId: { type: String, default: null },

    // ─── Identity ────────────────────────────────────────────────
    chainIndex: { type: String, required: true, index: true }, // chatId_category
    version: { type: Number, required: true, default: 1 },
    category: {
      type: String,
      enum: [
        "risk", "decision", "architecture", "action", "insight",
        "progress", "conflict", "question", "general",
      ],
      required: true,
      index: true,
    },

    // ─── Content ─────────────────────────────────────────────────
    title: { type: String, required: true },
    summary: { type: String, required: true },
    keyChanges: [{ type: String }],
    sourceFragment: { type: String },            // verbatim text this card was built from
    fragmentConfidence: { type: Number },         // 0.0–1.0

    // ─── Versioning chain ────────────────────────────────────────
    previousCardId: { type: String, default: null },
    conflictDetected: { type: Boolean, default: false },
    conflictReason: { type: String, default: "" },
    triggerType: {
      type: String,
      enum: ["new_message", "conflict", "threshold_change", "scheduled_update"],
      default: "new_message",
    },
    configChangesAtTrigger: { type: mongoose.Schema.Types.Mixed, default: null },

    // ─── Source tracking ─────────────────────────────────────────
    sourceType: {
      type: String,
      enum: ["chat", "delta", "kg_update", "manual", "auto_refresh"],
      default: "chat",
    },
    sourceMessageIds: [{ type: String }],
    sourceChatIds: [{ type: String }],

    // ─── Status & time ───────────────────────────────────────────
    status: {
      type: String,
      enum: ["active", "superseded", "stale", "draft", "approved", "archived"],
      default: "active",
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + THREE_DAYS_MS),
      index: true,
    },
    lastMessageTimestamp: { type: Date },
    supersededAt: { type: Date },
    supersededByTrigger: { type: String },

    // ─── Legacy fields (backward compat) ─────────────────────────
    // Kept so existing cards don't break. New cards use `category` + `status`.
    label: { type: String, default: null },
    expired: { type: Boolean, default: false },
    previousVersionId: { type: String, default: null },
    parentCardId: { type: String, default: null },

    // ─── KG diff (embedded) ──────────────────────────────────────
    kgDiff: {
      add: [{ id: String, label: String, type: { type: String } }],
      remove: [{ id: String }],
      edges: [{ from: String, to: String, label: String }],
      confidence: { type: Number, default: 0 },
      flushed: { type: Boolean, default: false },
    },

    // Legacy KG fields
    kgNodesAdded: [{ type: String }],
    kgNodesRemoved: [{ type: String }],
    kgUpdated: { type: Boolean, default: false },

    // ─── AI metadata ─────────────────────────────────────────────
    modelUsed: { type: String, default: "llama-3.1-70b-versatile" },
    generatedBy: { type: String, default: "llama-3.1-70b-versatile" },
    generationMs: { type: Number },
    suggestedAction: { type: String },
    promptUsed: { type: String, default: null },

    // Supabase future-proofing
    supabase_ref: { type: String, default: null },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────
TemporalCardSchema.index({ chainIndex: 1, status: 1 });
TemporalCardSchema.index({ sourceChatIds: 1, status: 1 });
TemporalCardSchema.index({ previousCardId: 1 });
TemporalCardSchema.index({ expiresAt: 1, status: 1 });
TemporalCardSchema.index({ projectId: 1, category: 1, version: -1 });
TemporalCardSchema.index({ projectId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("TemporalCard", TemporalCardSchema);
