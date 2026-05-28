// src/routes/callResolution.js
import { Router } from "express";
import { z } from "zod";
import { parseTranscript } from "../services/geminiService.js";
import { updateLead, addFollowUp } from "../services/crmService.js";
import { callQueue } from "../queues/callQueue.js";

const router = Router();

const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "clientNumber must be a valid +91 Indian mobile number");

const callResolutionSchema = z.object({
  leadId: z.union([z.string(), z.number()]).optional(),
  clientName: z.string().min(1, "clientName is required"),
  clientNumber: phoneSchema,
  clientRequirement: z.string().min(1, "clientRequirement is required"),
  clientOtherDetails: z.record(z.unknown()).optional().default({}),
  transcript: z.union([z.string().min(1), z.record(z.unknown())], {
    errorMap: () => ({ message: "transcript must be a non-empty string or key-value object" }),
  }),
});

/**
 * POST /api/v1/callResolution
 * 1. Parse transcript with Gemini Flash
 * 2. Update lead in CRM (fake)
 * 3. Add follow-up in CRM (fake)
 * 4. Re-queue the next call based on LLM's suggested delay
 * 5. Return full resolution to client
 */
router.post("/", async (req, res) => {
  const parse = callResolutionSchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      issues: parse.error.flatten().fieldErrors,
    });
  }

  const { leadId, clientName, clientNumber, clientRequirement, clientOtherDetails, transcript } =
    parse.data;

  // ── Step 1: Parse transcript with Gemini ──────────────────────────────────
  let resolution;
  try {
    resolution = await parseTranscript(transcript, {
      clientName,
      clientRequirement,
      clientOtherDetails,
    });
  } catch (err) {
    console.error(`[Resolution] Gemini parsing failed:`, err.message);
    return res.status(502).json({
      success: false,
      error: "LLM parsing failed",
      detail: err.message,
    });
  }

  // ── Step 2: Update lead in CRM ────────────────────────────────────────────
  const crmUpdatePayload = {
    callStatus: resolution.resolution,
    sentiment: resolution.sentiment,
    lastCallSummary: resolution.summary,
    nextAction: resolution.nextAction,
    urgency: resolution.urgency,
    updatedAt: new Date().toISOString(),
  };

  const effectiveLeadId = leadId ?? clientNumber.replace("+", "");
  await updateLead(effectiveLeadId, crmUpdatePayload);

  // ── Step 3: Add follow-up in CRM ──────────────────────────────────────────
  const shouldFollowUp = !["not_interested", "deal_closed"].includes(resolution.resolution);

  if (shouldFollowUp) {
    await addFollowUp(effectiveLeadId, {
      followUpAt: new Date(Date.now() + resolution.followUpDelayMinutes * 60 * 1000).toISOString(),
      notes: resolution.nextAction,
      assignedTo: "auto-scheduler",
    });

    // ── Step 4: Re-queue call in BullMQ ─────────────────────────────────────
    const job = await callQueue.add(
      "initiate-call",
      {
        clientName,
        clientNumber,
        clientRequirement,
        clientOtherDetails,
        attemptCount: (clientOtherDetails.attemptCount ?? 0) + 1,
        scheduledAt: new Date(
          Date.now() + resolution.followUpDelayMinutes * 60 * 1000
        ).toISOString(),
        previousResolution: resolution.resolution,
      },
      { delay: resolution.followUpDelayMinutes * 60 * 1000 }
    );

    console.log(
      `[Queue] Follow-up call queued | jobId=${job.id} | delay=${resolution.followUpDelayMinutes}min | client=${clientName}`
    );
  } else {
    console.log(
      `[Queue] No follow-up needed | resolution=${resolution.resolution} | client=${clientName}`
    );
  }

  return res.status(200).json({
    success: true,
    message: "Call resolution processed",
    resolution,
    crmUpdated: true,
    followUpScheduled: shouldFollowUp,
    followUpIn: shouldFollowUp ? `${resolution.followUpDelayMinutes} minutes` : null,
  });
});

export default router;
