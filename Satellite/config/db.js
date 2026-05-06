// config/db.js — MongoDB Atlas Connection (resilient)
const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("❌ MONGO_URI not set in .env");
    console.error("   The satellite will start but DB operations will fail.");
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // 10s timeout
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log("✅ MongoDB Atlas connected:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("──────────────────────────────────────────────");
    console.error("  FIX: Go to MongoDB Atlas → Network Access");
    console.error("  and add your current IP (or 0.0.0.0/0 for dev).");
    console.error("──────────────────────────────────────────────");
    console.error("  The satellite will start but DB operations will fail.");
    console.error("  It will auto-retry every 30 seconds.");

    // Retry in background
    setTimeout(retryConnect, 30000);
  }

  mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB runtime error:", err.message);
    isConnected = false;
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB disconnected — retrying in 30s...");
    isConnected = false;
    setTimeout(retryConnect, 30000);
  });

  mongoose.connection.on("connected", () => {
    isConnected = true;
  });
}

async function retryConnect() {
  if (isConnected) return;
  const uri = process.env.MONGO_URI;
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log("✅ MongoDB reconnected:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB retry failed:", err.message);
    setTimeout(retryConnect, 30000);
  }
}

function getConnectionStatus() {
  return isConnected;
}

module.exports = { connectDB, getConnectionStatus };
