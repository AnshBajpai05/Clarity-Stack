// routes/join.js — SMTP Join Request Flow
const express = require("express");
const { sendJoinRequestEmail } = require("../services/mailer");
const { requireAuth } = require("../middleware/auth");
const axios = require("axios");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";
const router = express.Router();

/**
 * POST /api/satellite/join/:projectId/email
 * Trigger an SMTP email to the PM requesting access.
 */
router.post("/:projectId/email", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const token = req.headers.authorization.split(" ")[1];

    // 1. Fetch project info from Core API to get PM email
    let project;
    try {
      const projRes = await axios.get(`${CORE_API}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      project = projRes.data;
    } catch (err) {
      return res.status(404).json({ error: "Project not found or accessible in core" });
    }

    const pmEmail = project.owner;
    if (!pmEmail) {
      return res.status(400).json({ error: "Project has no assigned owner to email." });
    }

    // 2. Send Email
    const result = await sendJoinRequestEmail({
      projectId,
      projectName: project.name,
      requesterEmail: req.user.email,
      pmEmail,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
