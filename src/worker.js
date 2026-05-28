// src/worker.js
import "dotenv/config";
import { Worker } from "bullmq";
import { connection, QUEUE_NAME } from "./queues/callQueue.js";
import { triggerCall, createRoom } from "./services/videoSdkService.js";
import { saveVideoSdkRoom } from "./services/crmService.js";
import { connectDB } from "./services/mongoose.js";

// Connect to MongoDB
connectDB();

console.log(`\n👷 Worker starting — listening on queue: "${QUEUE_NAME}"\n`);



/**
 * Fake call initiator — replace with your actual telephony SDK
 * e.g. Twilio, Exotel, Plivo, etc.
 */
async function initiateCall(jobData) {
  const { clientName, clientNumber, clientRequirement, clientOtherDetails, attemptCount } = jobData;

  console.log(`[Call]  ──────────────────────────────────────────`);
  console.log(`[Call]  Initiating call`);
  console.log(`[Call]  To      : ${clientName} (${clientNumber})`);
  console.log(`[Call]  Req     : ${clientRequirement}`);
  console.log(`[Call]  Attempt : #${attemptCount + 1}`);
  console.log(`[Call]  Meta    : ${JSON.stringify(clientOtherDetails)}`);

  // TODO: replace with real telephony provider call
  // e.g. Exotel:
  // await exotelClient.calls.create({ From: 'your-number', To: clientNumber, ... });
  //
  // e.g. Twilio:
  // await twilioClient.calls.create({ to: clientNumber, from: process.env.TWILIO_NUMBER, ... });

  console.log(`[Call]  ✅ Call initiated to ${clientNumber}`);
  console.log(`[Call]  ──────────────────────────────────────────`);

  // Simulate async call provider response
  await new Promise((r) => setTimeout(r, 200));

  return { called: true, to: clientNumber, at: new Date().toISOString() };
}

// ── Worker ────────────────────────────────────────────────────────────────────
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`\n[Worker] Picked up job | id=${job.id} | name=${job.name} | attempt=${job.attemptsMade + 1}`);

    try {
      const result = await initiateCall(job.data);
      console.log(`[Worker] Job ${job.id} completed | result=${JSON.stringify(result)}`);
      return result;
    } catch (err) {
      console.error(`[Worker] Job ${job.id} failed | error=${err.message}`);
      throw err; // re-throw so BullMQ retries per backoff policy
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

worker.on("active", async (job) => {
  console.log(`[Worker] Active | jobId=${job.id} | client=${job.data.clientName}`);
  
  let roomId = null;
  try {
    // 1. Create a unique customRoomId using the BullMQ job ID
    const customRoomId = `job-${job.id}`;
    const roomData = await createRoom(customRoomId);
    
    if (roomData && roomData.roomId) {
      roomId = roomData.roomId;
      
      // 2. Save the mock response data in DB with VideoSDK ID for later fetching of recordings
      await saveVideoSdkRoom(job.id, roomData);
    }
  } catch (err) {
    console.error(`[Worker] ❌ Failed to create room or save to DB:`, err.message);
  }

  // 3. Pass the created roomId to triggerCall
  await triggerCall(job.data.clientNumber, job.data.clientName, "Rentopus", "hinglish", roomId);
});

worker.on("completed", (job, result) => {
  console.log(`[Worker] Completed | jobId=${job.id} | to=${result.to} | at=${result.at}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[Worker] Failed | jobId=${job?.id} | attempt=${job?.attemptsMade} | error=${err.message}`
  );
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Stalled | jobId=${jobId}`);
});

worker.on("error", (err) => {
  console.error(`[Worker] Error:`, err.message);
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
