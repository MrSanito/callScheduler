// src/routes/leadList.js
import { Router } from "express";
import { fetchTodayLeads } from "../services/crmService.js";
import { callQueue } from "../queues/callQueue.js";

const router = Router();

/**
 * GET /api/v1/leadList
 * 1. Fetch today's leads from CRM (fake for now)
 * 2. Bulk-add all leads to BullMQ call-queue
 * 3. Return lead list + job IDs to client
 */
router.get("/", async (req, res) => {
  // ── Step 1: Fetch today's leads ───────────────────────────────────────────
  let leads;
  try {
    leads = await fetchTodayLeads();
  } catch (err) {
    console.error(`[LeadList] Failed to fetch leads from CRM:`, err.message);
    return res.status(502).json({
      success: false,
      error: "Failed to fetch leads from CRM",
      detail: err.message,
    });
  }

  if (!leads.length) {
    console.log(`[LeadList] No leads found for today`);
    return res.status(200).json({
      success: true,
      message: "No leads found for today",
      total: 0,
      scheduled: [],
    });
  }

  // ── Step 2: Bulk-queue all leads ──────────────────────────────────────────
  // Stagger calls by 20 seconds each to avoid hammering the call provider
  const STAGGER_SECONDS = 20;

  const bulkJobs = leads.map((lead, index) => ({
    name: "initiate-call",
    data: {
      clientName: lead.clientName,
      clientNumber: lead.clientNumber,
      clientRequirement: lead.clientRequirement,
      clientOtherDetails: { ...lead.clientOtherDetails, leadId: lead.id },
      attemptCount: 0,
      scheduledAt: new Date(Date.now() + index * STAGGER_SECONDS * 1000).toISOString(),
    },
    opts: {
      delay: index * STAGGER_SECONDS * 1000,
      jobId: `lead-${lead.id}-${Date.now()}`, // idempotent job IDs
    },
  }));

  const jobs = await callQueue.addBulk(bulkJobs);

  const scheduled = jobs.map((job, i) => ({
    jobId: job.id,
    clientName: leads[i].clientName,
    clientNumber: leads[i].clientNumber,
    scheduledAt: bulkJobs[i].data.scheduledAt,
  }));

  console.log(`[LeadList] ${scheduled.length} leads queued for calls today`);
  scheduled.forEach((s) =>
    console.log(`  → jobId=${s.jobId} | ${s.clientName} (${s.clientNumber}) | at=${s.scheduledAt}`)
  );

  return res.status(200).json({
    success: true,
    message: `${scheduled.length} leads scheduled for calls`,
    total: scheduled.length,
    staggerSeconds: STAGGER_SECONDS,
    scheduled,
  });
});

export default router;
