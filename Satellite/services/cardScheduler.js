// services/cardScheduler.js — v4 Auto-generation scheduler with timestamp gating
const TemporalCard = require("../models/TemporalCard");
const { autoGenerateCards, expireOldCards } = require("./cardChainer");
const jwt = require("jsonwebtoken");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";
const CHECK_INTERVAL = parseInt(process.env.SCHEDULER_INTERVAL_HOURS || "6", 10) * 60 * 60 * 1000;

// Reserved internal-automation identity. Must match Core's SERVICE_ACCOUNT_EMAIL,
// which Core grants read-only project access to (Backend/main.py).
const SERVICE_ACCOUNT_EMAIL = "service@claritystack.internal";

let schedulerInterval = null;

/**
 * Mint a short-lived service token locally, signed with the shared JWT_SECRET.
 * Replaces the old dependency on the unauthenticated /api/auth/client-login
 * endpoint (§5.1) — a real service credential, not a forged guest token.
 */
function getServiceToken() {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.warn("⏰ [CardScheduler] JWT_SECRET not set — cannot mint service token.");
    return null;
  }
  return jwt.sign(
    { sub: SERVICE_ACCOUNT_EMAIL, role: "service" },
    JWT_SECRET,
    { expiresIn: "10m" }
  );
}

/**
 * Run the scheduler cycle: expire stale cards, auto-generate from new messages.
 */
async function runSchedulerCycle() {
  console.log("⏰ [CardScheduler] Running v4 auto-generation cycle...");

  try {
    // 1. Find all projects that have cards
    const projectIds = await TemporalCard.distinct("projectId");

    if (projectIds.length === 0) {
      console.log("⏰ [CardScheduler] No projects with cards found. Skipping.");
      return;
    }

    // 2. Expire old cards across all projects
    let totalExpired = 0;
    for (const projectId of projectIds) {
      const count = await expireOldCards(projectId);
      totalExpired += count;
    }

    if (totalExpired > 0) {
      console.log(
        `⏰ [CardScheduler] ${totalExpired} cards marked stale across ${projectIds.length} projects.`
      );
    }

    // 3. Try to auto-generate (needs a token)
    const token = await getServiceToken();
    if (!token) {
      console.log("⏰ [CardScheduler] No service token available. Skipping auto-generation.");
      return;
    }

    let totalGenerated = 0;
    for (const projectId of projectIds) {
      try {
        const result = await autoGenerateCards(projectId, token);
        totalGenerated += (result.generated || []).length;
        if (result.generated?.length > 0) {
          console.log(`⏰ [CardScheduler] ${projectId}: ${result.message}`);
        }
      } catch (err) {
        console.warn(`⏰ [CardScheduler] Error for project ${projectId}: ${err.message}`);
      }
    }

    console.log(
      `⏰ [CardScheduler] Cycle complete: ${totalExpired} stale, ${totalGenerated} generated across ${projectIds.length} projects.`
    );
  } catch (err) {
    console.error("⏰ [CardScheduler] Cycle error:", err.message);
  }
}

/**
 * Start the card scheduler.
 */
function startCardScheduler() {
  const hours = CHECK_INTERVAL / (60 * 60 * 1000);
  console.log(`⏰ [CardScheduler] Starting — will check every ${hours} hours...`);

  // Run once after a short delay (let the server fully boot)
  setTimeout(() => {
    runSchedulerCycle().catch(console.error);
  }, 30000); // 30s after boot

  // Then run on interval
  schedulerInterval = setInterval(() => {
    runSchedulerCycle().catch(console.error);
  }, CHECK_INTERVAL);
}

/**
 * Stop the scheduler.
 */
function stopCardScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("⏰ [CardScheduler] Stopped.");
  }
}

module.exports = { startCardScheduler, stopCardScheduler, runSchedulerCycle };
