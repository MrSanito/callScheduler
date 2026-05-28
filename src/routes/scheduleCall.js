// src/routes/scheduleCall.js
import { Router } from "express";
import { z } from "zod";
import { callQueue } from "../queues/callQueue.js";

const router = Router();

// Only +91 Indian numbers
const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "clientNumber must be a valid +91 Indian mobile number");

const scheduleCallSchema = z.object({
  clientName: z.string().min(1, "clientName is required"),
  clientNumber: phoneSchema,
  clientRequirement: z.string().min(1, "clientRequirement is required"),
  clientOtherDetails: z.record(z.unknown()).optional().default({}),
  delayMinutes: z.number().int().min(0).optional().default(0), // optional: schedule X mins from now
});

/**
 * POST /api/v1/scheduleCall
 * Validates payload, pushes job to BullMQ call-queue.
 */
router.post("/", async (req, res) => {
  const parse = scheduleCallSchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      issues: parse.error.flatten().fieldErrors,
    });
  }

  const { clientName, clientNumber, clientRequirement, clientOtherDetails, delayMinutes } =
    parse.data;

  const jobData = {
    clientName,
    clientNumber,
    clientRequirement,
    clientOtherDetails,
    attemptCount: 0,
    scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
  };

  const jobOptions = delayMinutes > 0 ? { delay: delayMinutes * 60 * 1000 } : {};

  const job = await callQueue.add("initiate-call", jobData, jobOptions);

  console.log(
    `[Queue] Job added | id=${job.id} | client=${clientName} | number=${clientNumber} | delay=${delayMinutes}min`
  );

  return res.status(201).json({
    success: true,
    message: "Call scheduled successfully",
    jobId: job.id,
    scheduledAt: jobData.scheduledAt,
    data: { clientName, clientNumber },
  });
});

export default router;
