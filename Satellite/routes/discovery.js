// routes/discovery.js — Social Discovery routes (feed, search, follow)
const express = require("express");
const SocialFollow = require("../models/SocialFollow");
const GraphDelta = require("../models/GraphDelta");
const { requireAuth } = require("../middleware/auth");
const axios = require("axios");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";
const router = express.Router();

/**
 * GET /api/satellite/discovery/following
 * List project IDs the user follows.
 */
router.get("/following", requireAuth, async (req, res) => {
  try {
    const follows = await SocialFollow.find({ followerEmail: req.user.email }).lean();
    res.json(follows.map((f) => f.projectId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/satellite/discovery/follow/:projectId
 * Follow a project.
 */
router.post("/follow/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    await SocialFollow.updateOne(
      { followerEmail: req.user.email, projectId },
      { followerEmail: req.user.email, projectId },
      { upsert: true }
    );
    
    res.json({ success: true, projectId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/satellite/discovery/unfollow/:projectId
 * Unfollow a project.
 */
router.delete("/unfollow/:projectId", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    await SocialFollow.deleteOne({ followerEmail: req.user.email, projectId });
    
    res.json({ success: true, projectId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/satellite/discovery/feed
 * Social feed: Get latest deltas from followed projects.
 */
router.get("/feed", requireAuth, async (req, res) => {
  try {
    // 1. Get followed project IDs
    const follows = await SocialFollow.find({ followerEmail: req.user.email }).lean();
    const followedIds = follows.map((f) => f.projectId);

    if (followedIds.length === 0) {
      return res.json([]);
    }

    // 2. Fetch latest deltas for those projects
    const recentDeltas = await GraphDelta.find({ projectId: { $in: followedIds } })
      .sort({ computedAt: -1 })
      .limit(20)
      .lean();

    // 3. Fetch project metadata from core (optional enhancement)
    // For now, return the raw deltas for the frontend to render
    res.json(recentDeltas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
