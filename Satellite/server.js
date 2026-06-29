// server.js — Main Express Application
require("dotenv").config({ override: true });

// §6.3: validate required env up-front (aggregated, fail-fast) BEFORE requiring
// routes/middleware, so a misconfig surfaces as one clear boot error.
const { loadEnv } = require("./config/env");
const env = loadEnv();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB, getConnectionStatus } = require("./config/db");
const { initMailer } = require("./services/mailer");
const { startCardScheduler } = require("./services/cardScheduler");

// Routes
const kgRoutes = require("./routes/kg");
const deltaRoutes = require("./routes/delta");
const cardsRoutes = require("./routes/cards");
const exportRoutes = require("./routes/export");
const discoveryRoutes = require("./routes/discovery");
const joinRoutes = require("./routes/join");
const internalRoutes = require("./routes/internal");
const generateRoutes = require("./routes/generate");

const app = express();
const PORT = env.PORT;

// CORS allow-list (§5.5) — explicit origins instead of reflecting any. Override
// per environment with CORS_ORIGINS (comma-separated); defaults to local dev UIs.
const ALLOWED_ORIGINS = env.CORS_ORIGINS
  .split(",").map((s) => s.trim()).filter(Boolean);

// Middleware
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cookieParser());  // §5.4: parse cookies for httpOnly access_token
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  console.log(`[Satellite] ${req.method} ${req.url}`);
  next();
});

// Connect DB & Init Services
connectDB();
initMailer();
startCardScheduler();

// Register Routes
const BASE_PATH = "/api/satellite";
app.use(`${BASE_PATH}/kg`, kgRoutes);
app.use(`${BASE_PATH}/delta`, deltaRoutes);
app.use(`${BASE_PATH}/cards`, cardsRoutes);
app.use(`${BASE_PATH}/export`, exportRoutes);
app.use(`${BASE_PATH}/discovery`, discoveryRoutes);
app.use(`${BASE_PATH}/join`, joinRoutes);
app.use(`${BASE_PATH}/internal`, internalRoutes);
app.use(`${BASE_PATH}/generate`, generateRoutes);

// Healthcheck — includes DB + SMTP status
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "clarity-satellite",
    db: getConnectionStatus() ? "connected" : "disconnected",
    timestamp: new Date(),
  });
});

// Start Server — §5.5: bind to env.BIND_HOST (localhost by default).
app.listen(PORT, env.BIND_HOST, () => {
  console.log(`=========================================`);
  console.log(`🚀 Clarity Satellite running on http://${env.BIND_HOST}:${PORT}`);
  console.log(`=========================================`);
});
