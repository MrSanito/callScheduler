import { z } from "zod";
import {
  processLeadAndQueueImmediate,
  fetchAndScheduleTodayFollowup,
  resolveCall,
  fetchAndStaggerTodayLeads,
  getAllLeads as getAllLeadsService
} from "../services/lead.service.js";

const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "clientNumber must be a valid +91 Indian mobile number");

const scheduleCallSchema = z.object({
  clientName: z.string().min(1, "clientName is required"),
  clientNumber: phoneSchema,
  clientRequirement: z.string().min(1, "clientRequirement is required"),
  clientOtherDetails: z.record(z.unknown()).optional().default({}),
  delayMinutes: z.number().int().min(0).optional().default(0),
  shopName: z.string().optional().default(""),
});

const callResolutionSchema = z.object({
  leadId: z.union([z.string(), z.number()]).optional(),
  clientName: z.string().min(1, "clientName is required"),
  clientNumber: phoneSchema,
  clientRequirement: z.string().min(1, "clientRequirement is required"),
  clientOtherDetails: z.record(z.unknown()).optional().default({}),
  transcript: z.string().min(1, "transcript is required"),
});

/**
 * POST /leads & POST /newLeads
 */
export async function createLead(req, res, next) {
  try {
    const isNewLeadsPath = req.path.includes("newLeads");
    const { clientNumber } = req.body;

    if (!clientNumber) {
      return res.status(400).json({
        success: false,
        error: "clientNumber is required",
      });
    }

    const { lead, job } = await processLeadAndQueueImmediate(req.body, isNewLeadsPath);

    return res.status(201).json({
      success: true,
      message: isNewLeadsPath 
        ? "Lead created and call scheduled immediately via /newLeads" 
        : "Lead created and call scheduled immediately",
      leadId: lead._id,
      jobId: job.id,
      data: {
        clientName: lead.clientName,
        clientNumber: lead.clientNumber,
        status: lead.status,
        totalAttempts: lead.totalAttempts,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /TodayFollowup
 */
export async function getTodayFollowup(req, res, next) {
  try {
    const cleanedLeads = await fetchAndScheduleTodayFollowup();

    return res.status(200).json({
      success: true,
      message: `Successfully fetched and processed ${cleanedLeads.length} leads with AI cleanup`,
      total: cleanedLeads.length,
      data: cleanedLeads,
    });
  } catch (err) {
    next(err);
  }
}


/**
 * GET /leadList
 */
export async function getLeadList(req, res, next) {
  try {
    const scheduled = await fetchAndStaggerTodayLeads();

    if (!scheduled.length) {
      return res.status(200).json({
        success: true,
        message: "No leads found for today",
        total: 0,
        scheduled: [],
      });
    }

    return res.status(200).json({
      success: true,
      message: `${scheduled.length} leads scheduled for calls`,
      total: scheduled.length,
      staggerSeconds: 20,
      scheduled,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /leads (Frontend Route)
 */
export async function getAllLeads(req, res, next) {
  try {
    const leads = await getAllLeadsService();
    return res.status(200).json({
      success: true,
      total: leads.length,
      data: leads,
    });
  } catch (err) {
    next(err);
  }
}
