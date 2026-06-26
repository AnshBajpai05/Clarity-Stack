// server.js — Main Express Application
require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
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
const PORT = process.env.PORT || 8003;

// Middleware
app.use(cors());
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

// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`=========================================`);
  console.log(`🚀 Clarity Satellite running on http://0.0.0.0:${PORT}`);
  console.log(`=========================================`);
});
