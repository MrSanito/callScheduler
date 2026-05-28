// src/services/mongoose.js
import mongoose from "mongoose";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/call_scheduler";

/**
 * Connect to MongoDB using Mongoose
 */
export async function connectDB() {
  try {
    // Prevent multiple connections
    if (mongoose.connection.readyState >= 1) {
      return mongoose.connection;
    }

    mongoose.connection.on("connected", () => {
      console.log("🍃 [MongoDB] Successfully connected to Database");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ [MongoDB] Connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ [MongoDB] Disconnected from Database");
    });

    // Gracefully handle process termination
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      process.exit(0);
    });

    await mongoose.connect(MONGODB_URI, {
      // Modern mongoose defaults are safe, but can pass configuration if needed
    });

    return mongoose.connection;
  } catch (err) {
    console.error("❌ [MongoDB] Initial connection error:", err.message);
    // In production, you might want to retry connection or crash gracefully
    // throw err;
  }
}
export default connectDB;
