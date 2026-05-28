// src/queues/callQueue.js
import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null, // required by BullMQ
});

connection.on("connect", () => console.log("[Redis] Connected"));
connection.on("error", (err) => console.error("[Redis] Error:", err.message));

const QUEUE_NAME = "call-queue";

const callQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export { callQueue, connection, QUEUE_NAME };
