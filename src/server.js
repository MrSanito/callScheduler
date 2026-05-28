// src/server.js
import "dotenv/config";
import express from "express";
import { requestLogger } from "./middleware/requestLogger.js";
import scheduleCallRouter from "./routes/scheduleCall.js";
import callResolutionRouter from "./routes/callResolution.js";
import leadListRouter from "./routes/leadList.js";
import { connectDB } from "./services/mongoose.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();


// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger); // logs every request/response

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/v1/scheduleCall",   scheduleCallRouter);
app.use("/api/v1/callResolution", callResolutionRouter);
app.use("/api/v1/leadList",       leadListRouter);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(`[ERROR] ${err.message}`, err.stack);
  res.status(500).json({ success: false, error: "Internal server error", detail: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`   POST /api/v1/scheduleCall`);
  console.log(`   POST /api/v1/callResolution`);
  console.log(`   GET  /api/v1/leadList\n`);
});

export default app;
