// models/JoinEmailLog.js — SMTP email audit trail
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const JoinEmailLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    projectId: { type: String, required: true, index: true },
    projectName: { type: String, default: null },
    requesterEmail: { type: String, required: true },
    pmEmail: { type: String, required: true },
    subject: { type: String, default: null },
    sentAt: { type: Date, default: Date.now },
    messageId: { type: String, default: null },
    status: {
      type: String,
      enum: ["sent", "failed", "pending"],
      default: "pending",
    },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

JoinEmailLogSchema.index({ projectId: 1, sentAt: -1 });

module.exports = mongoose.model("JoinEmailLog", JoinEmailLogSchema);
