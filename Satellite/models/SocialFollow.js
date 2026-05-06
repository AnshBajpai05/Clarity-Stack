// models/SocialFollow.js — Follow/Unfollow relationships
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const SocialFollowSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uuidv4() },
    followerEmail: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    followedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// One user can follow a project only once
SocialFollowSchema.index({ followerEmail: 1, projectId: 1 }, { unique: true });

module.exports = mongoose.model("SocialFollow", SocialFollowSchema);
