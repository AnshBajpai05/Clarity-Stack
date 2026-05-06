// services/cardScheduler.js — Auto-generation scheduler for temporal cards
const TemporalCard = require("../models/TemporalCard");
const { autoGenerateCards, expireOldCards } = require("./cardChainer");
const axios = require("axios");

const CORE_API = process.env.CORE_API_URL || "http://127.0.0.1:8000";
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

let schedulerInterval = null;

/**
 * Get a service-level token for automated operations.
 * Uses the first project's owner to create a session token.
 */
async function getServiceToken() {
  // Try to get a token via client-login for any known project
  try {
    const Project = require("mongoose").model("TemporalCard");
    const anyCard = await Project.findOne().lean();
    if (anyCard) {
      const res = await axios.post(`${CORE_API}/api/auth/client-login`, {
        project_id: anyCard.projectId,
      }, { timeout: 5000 });
      return res.data.access_token;
    }
  } catch (err) {
    // Fallback: no token available for auto-generation
  }
  return null;
}

/**
 * Run the scheduler cycle: expire old cards and auto-generate new ones.
 */
async function runSchedulerCycle() {
  console.log("⏰ [CardScheduler] Running auto-generation cycle...");

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
      console.log(`⏰ [CardScheduler] Expired ${totalExpired} cards across ${projectIds.length} projects.`);
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
      `⏰ [CardScheduler] Cycle complete: ${totalExpired} expired, ${totalGenerated} generated across ${projectIds.length} projects.`
    );
  } catch (err) {
    console.error("⏰ [CardScheduler] Cycle error:", err.message);
  }
}

/**
 * Start the card scheduler.
 */
function startCardScheduler() {
  console.log("⏰ [CardScheduler] Starting — will check every 6 hours...");

  // Run once after a short delay (let the server fully boot)
  setTimeout(() => {
    runSchedulerCycle().catch(console.error);
  }, 30000); // 30s after boot

  // Then run every 6 hours
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
