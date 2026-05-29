// src/worker.js
import "dotenv/config";
import mongoose from "mongoose";
import { Worker } from "bullmq";
import { connection, QUEUE_NAME } from "./queues/callQueue.js";
import { triggerCall, createRoom } from "./services/videoSdkService.js";
import { connectDB } from "./services/mongoose.js";
import { Lead, VideoSdkRoom, CallHistory } from "./models/mongooseModels.js";

// Connect to MongoDB
connectDB();

function normalizePhoneNumber(phone) {
  if (!phone) return "";
  let clean = phone.toString().trim().replace(/[\s-()]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.length === 10) return "+91" + clean;
  if (clean.length === 12 && clean.startsWith("91")) return "+" + clean;
  if (clean.startsWith("91")) return "+" + clean;
  return "+91" + clean;
}

console.log(`\n👷 Worker starting — listening on queue: "${QUEUE_NAME}"\n`);

/**
 * Fake call initiator — replace with your actual telephony SDK
 * e.g. Twilio, Exotel, Plivo, etc.
 */
async function initiateCall(jobData) {
  const { clientName, clientNumber, attemptNum } = jobData;

  console.log(`[Telephony] ──────────────────────────────────────────`);
  console.log(`[Telephony] Initiating Call Simulation`);
  console.log(`[Telephony] To      : ${clientName} (${clientNumber})`);
  console.log(`[Telephony] Attempt : #${attemptNum || 1}`);
  console.log(`[Telephony] ✅ Telephony dialer successfully triggered`);
  console.log(`[Telephony] ──────────────────────────────────────────`);

  // Simulate call initialization delay
  await new Promise((r) => setTimeout(r, 500));

  return { called: true, to: clientNumber, at: new Date().toISOString() };
}

// ── Worker ────────────────────────────────────────────────────────────────────
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`\n[Worker] picked up job | id=${job.id} | leadId=${job.data.leadId} | attempt=${job.data.attemptNum || 1}`);

    const { leadId, clientName, shopName, clientNumber, clientRequirement, clientOtherDetails, attemptNum } = job.data;

    try {
      // 1. Fetch, create, or update the Lead document in database
      let lead = null;
      const cleanNumber = normalizePhoneNumber(clientNumber);
      
      if (leadId) {
        try {
          lead = await Lead.findById(leadId);
        } catch (dbErr) {
          console.warn(`[Worker] Error seeking Lead by ID ${leadId}:`, dbErr.message);
        }
      }
      
      if (!lead && cleanNumber) {
        lead = await Lead.findOne({ clientNumber: cleanNumber });
      }

      const finalShopName = shopName || (clientOtherDetails && clientOtherDetails.shopName) || "";

      if (lead) {
        // Check max attempts limit (3)
        if (lead.totalAttempts >= 3) {
          console.log(`[Worker] ⛔ Lead ${lead._id} has reached max 3 attempts. Skipping call.`);
          lead.status = "failed";
          await lead.save();
          return { skipped: true, reason: "max_attempts_reached" };
        }

        // Lead exists: update totalAttempts and status to active
        lead.totalAttempts = attemptNum || (lead.totalAttempts + 1);
        lead.status = "active";
        if (finalShopName) {
          lead.shopName = finalShopName;
        }
        await lead.save();
        console.log(`[Worker] Updated existing Lead ${lead._id} to status 'active', attempts = ${lead.totalAttempts}`);
      } else {
        // Lead does NOT exist in DB: Create it dynamically!
        lead = new Lead({
          clientName: clientName || "Customer",
          shopName: finalShopName,
          clientNumber: cleanNumber,
          clientRequirement: clientRequirement || "General Follow-up",
          clientOtherDetails: clientOtherDetails || {},
          status: "active",
          totalAttempts: attemptNum || 1
        });
        await lead.save();
        console.log(`[Worker] Lead not found in DB. Created new Lead document on the fly: ${lead._id} (${cleanNumber})`);
      }

      // 2. Create a unique, descriptive customRoomId including outbound tag, name, phone, and job ID
      const cleanNameForId = (clientName || "customer").toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanPhoneForId = (clientNumber || "unknown").replace("+", "");
      const customRoomId = `outboundCall-${cleanNameForId}-${cleanPhoneForId}-${job.id}`;
      console.log(`[Worker] Creating VideoSDK Room with customRoomId: "${customRoomId}"`);
      
      const roomData = await createRoom(customRoomId);
      if (!roomData || !roomData.roomId) {
        throw new Error(`Failed to create VideoSDK room for job ${job.id}`);
      }
      
      const serviceRoomId = roomData.roomId;

      // 3. Save the VideoSDK Room to DB
      const sdkRoom = new VideoSdkRoom({
        roomId: serviceRoomId,
        customRoomId,
      });
      await sdkRoom.save();
      console.log(`[Worker] Registered VideoSDK Room in DB: ${serviceRoomId}`);

      // 4. Save Call Attempt (CallHistory) to DB
      const callHistory = new CallHistory({
        leadId: lead ? lead._id : new mongoose.Types.ObjectId(),
        roomId: serviceRoomId,
        customRoomId,
        attemptCount: attemptNum || 1,
        status: "active",
        startedAt: new Date(),
      });
      await callHistory.save();
      console.log(`[Worker] Saved Call History attempt record: ${callHistory._id}`);

      // 5. Trigger the SIP outbound call linking it to the VideoSDK Room
      console.log(`[Worker] Triggering outbound SIP call connecting ${clientNumber} to room ${serviceRoomId}`);
      await triggerCall(clientNumber, clientName, "Rentopus", "hinglish", serviceRoomId);

      // 6. Simulate Telephony Client Integration
      const result = await initiateCall(job.data);
      console.log(`[Worker] Telephony trigger completed successfully.`);

      return {
        success: true,
        callId: callHistory._id,
        roomId: serviceRoomId,
        customRoomId,
        telephonyResult: result,
      };
    } catch (err) {
      console.error(`[Worker] ❌ Processing Error on job ${job.id}:`, err.message);
      
      // Update Lead status to failed if error occurred
      if (leadId) {
        try {
          await Lead.findByIdAndUpdate(leadId, { status: "failed" });
        } catch (dbErr) {
          console.error(`[Worker] Failed to set Lead status to failed:`, dbErr.message);
        }
      }
      
      throw err; // Re-throw so BullMQ triggers retry mechanisms
    }
  },
  {
    connection,
    concurrency: 3, // process up to 3 calls simultaneously
    limiter: {
      max: 10,        // max 10 jobs
      duration: 60000, // per 60 seconds — rate-limits the call provider
    },
  }
);

// ── Worker Event Hooks ────────────────────────────────────────────────────────
worker.on("ready", () => {
  console.log(`[Worker] Ready ✅ — waiting for jobs on "${QUEUE_NAME}"`);
});

worker.on("active", (job) => {
  console.log(`[Worker] Active Hook | jobId=${job.id} | client=${job.data.clientName}`);
});

worker.on("completed", (job, result) => {
  console.log(`[Worker] Completed Hook | jobId=${job.id} | roomId=${result.roomId}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[Worker] Failed Hook | jobId=${job?.id} | error=${err.message}`
  );
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Stalled Hook | jobId=${jobId}`);
});

worker.on("error", (err) => {
  console.error(`[Worker] Global Error:`, err.message);
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[Worker] ${signal} received — shutting down gracefully...`);
  await worker.close();
  console.log(`[Worker] Closed ✅`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
