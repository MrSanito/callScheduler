import { Lead, CallHistory } from "../models/mongooseModels.js";
import { callQueue } from "../queues/callQueue.js";
import { parseTranscript, cleanupLeadsList } from "./geminiService.js";
import { updateLead, addFollowUp, fetchTodayLeads } from "./crmService.js";

function normalizePhoneNumber(phone) {
  if (!phone) return "";
  let clean = phone.toString().trim().replace(/[\s-()]/g, "");
  if (clean.startsWith("+")) return clean;
  if (clean.length === 10) return "+91" + clean;
  if (clean.length === 12 && clean.startsWith("91")) return "+" + clean;
  if (clean.startsWith("91")) return "+" + clean;
  return "+91" + clean;
}

/**
 * Saves/updates lead and queues an immediate call
 */
export async function processLeadAndQueueImmediate({ clientName, clientNumber, clientRequirement, clientOtherDetails, shopName }, isNewLeadsPath = false) {
  const cleanNumber = normalizePhoneNumber(clientNumber);
  const name = clientName || "Customer";
  const requirement = clientRequirement || "General Follow-up";
  const otherDetails = clientOtherDetails || {};
  const finalShopName = shopName || (otherDetails && otherDetails.shopName) || "";

  // Check if lead already exists
  let lead = await Lead.findOne({ clientNumber: cleanNumber });

  if (lead) {
    lead.clientName = name;
    lead.shopName = finalShopName;
    lead.clientRequirement = requirement;
    lead.clientOtherDetails = { ...lead.clientOtherDetails, ...otherDetails };
    lead.status = "pending";
    lead.totalAttempts = 0;
    await lead.save();
    console.log(`[Lead Service] Re-activated existing lead: ${cleanNumber}`);
  } else {
    lead = new Lead({
      clientName: name,
      shopName: finalShopName,
      clientNumber: cleanNumber,
      clientRequirement: requirement,
      clientOtherDetails: otherDetails,
      status: "pending",
      totalAttempts: 0,
    });
    await lead.save();
    console.log(`[Lead Service] Created new lead: ${name} (${cleanNumber})`);
  }

  // Queue initial job with attemptNum = 1, delay = 0
  const jobData = {
    leadId: lead._id.toString(),
    clientName: name,
    shopName: finalShopName,
    clientNumber: cleanNumber,
    clientRequirement: requirement,
    clientOtherDetails: otherDetails,
    attemptNum: 1,
  };

  const pathTag = isNewLeadsPath ? "newLeads" : "leads";
  const job = await callQueue.add("initiate-call", jobData, {
    delay: 0,
    jobId: `lead-${lead._id.toString()}-attempt-1-${pathTag}-${Date.now()}`
  });

  console.log(`[Lead Service] Queued immediate job | id=${job.id} | leadId=${lead._id}`);

  return { lead, job };
}

/**
 * Fetches today's CRM followups and queues call jobs after 5 mins delay
 */
export async function fetchAndScheduleTodayFollowup() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const url = "https://rcrm-api.rentopus.in/api/external/leads/GetTodaysFollowupByUserId";
  
  console.log(`[Lead Service] Fetching today's CRM followups for date: ${today}`);

  const payload = {
    userId: 5,
    fromDate: today,
    toDate: today
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "accept": "*/*",
      "Content-Type": "application/json",
      "X-API-Key": "Q6HP0ydkWpgp2wCKa3Lnc3zAVQEPlYzbg3JRpKEqz94"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`CRM API responded with status ${response.status} — ${errText}`);
  }

  const responseData = await response.json();
  
  if (!responseData.success || !responseData.data || !responseData.data.length) {
    console.log(`[Lead Service] No leads returned from CRM API`);
    return [];
  }

  // AI Cleanup using Gemini
  const cleanedLeads = await cleanupLeadsList(responseData.data);
  console.log("\n=================== [CLEANED LEADS AFTER GEMINI CLEANUP] ===================");
  console.log(JSON.stringify(cleanedLeads, null, 2));
  console.log("============================================================================\n");

  // Save/Update each cleaned lead in the database, keeping call scheduling commented out
  for (const rawLead of responseData.data) {
    const cleanedLead = cleanedLeads.find(l => l.RcromId === rawLead.id);
    if (!cleanedLead) continue;

    const { name, contactNo, shopName, relatedDetails } = cleanedLead;
    if (!contactNo) continue;

    const cleanNumber = normalizePhoneNumber(contactNo);
    const clientName = name || "Customer";
    const finalShopName = shopName || "";
    const clientRequirement = relatedDetails || "";

    const clientOtherDetails = {
      crmLeadId: rawLead.id,
      shopName: rawLead.shopName,
      remarks: rawLead.remarks,
      leadStatusId: rawLead.leadStatusId,
      comment: rawLead.comment,
      leadLabelIds: rawLead.leadLabelIds,
      leadLabelName: rawLead.leadLabelName,
      source: "TodayFollowup",
    };

    let lead = await Lead.findOne({ clientNumber: cleanNumber });

    if (lead) {
      lead.RcromId = rawLead.id;
      lead.clientName = clientName;
      lead.shopName = finalShopName;
      lead.clientRequirement = clientRequirement;
      lead.clientOtherDetails = { ...lead.clientOtherDetails, ...clientOtherDetails };
      lead.status = "pending";
      lead.totalAttempts = 0;
      await lead.save();
      console.log(`[Lead Service] Updated lead in DB: ${clientName} (${cleanNumber}) with RcromId=${rawLead.id}`);
    } else {
      lead = new Lead({
        RcromId: rawLead.id,
        clientName,
        shopName: finalShopName,
        clientNumber: cleanNumber,
        clientRequirement,
        clientOtherDetails,
        status: "pending",
        totalAttempts: 0,
      });
      await lead.save();
      console.log(`[Lead Service] Saved new lead in DB: ${clientName} (${cleanNumber}) with RcromId=${rawLead.id}`);
    }

    // CALL SCHEDULING COMMENTED OUT AS REQUESTED
    // const jobData = {
    //   leadId: lead._id.toString(),
    //   clientName,
    //   shopName: finalShopName,
    //   clientNumber: cleanNumber,
    //   clientRequirement,
    //   clientOtherDetails,
    //   attemptNum: 1,
    // };
    //
    // const FIVE_MINUTES_MS = 5 * 60 * 1000;
    // const job = await callQueue.add("initiate-call", jobData, {
    //   delay: FIVE_MINUTES_MS,
    //   jobId: `lead-${lead._id.toString()}-attempt-1-followup-${Date.now()}`
    // });
  }

  return cleanedLeads;
}

/**
 * Schedules a single immediate or delayed call
 */
export async function scheduleSingleCall({ clientName, clientNumber, clientRequirement, clientOtherDetails, delayMinutes }) {
  const delayMs = (delayMinutes || 0) * 60 * 1000;
  const scheduledAt = new Date(Date.now() + delayMs).toISOString();

  const jobData = {
    clientName,
    clientNumber,
    clientRequirement,
    clientOtherDetails: clientOtherDetails || {},
    attemptCount: 0,
    scheduledAt,
  };

  const jobOptions = delayMs > 0 ? { delay: delayMs } : {};
  const job = await callQueue.add("initiate-call", jobData, jobOptions);

  console.log(`[Lead Service] Single call scheduled | id=${job.id} | client=${clientName} | delay=${delayMinutes}min`);

  return { job, scheduledAt };
}

/**
 * Processes transcript with Gemini and updates lead status & handles followups
 */
export async function resolveCall({ leadId, clientName, clientNumber, clientRequirement, clientOtherDetails, transcript }) {
  // 1. Parse transcript with Gemini
  const resolution = await parseTranscript(transcript, {
    clientName,
    clientRequirement,
    clientOtherDetails,
  });

  // 2. Update lead in CRM
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

  // 3. Add follow-up in CRM if needed
  const shouldFollowUp = !["not_interested", "deal_closed"].includes(resolution.resolution);
  let followUpJob = null;

  if (shouldFollowUp) {
    const delayMs = resolution.followUpDelayMinutes * 60 * 1000;
    const followUpAt = new Date(Date.now() + delayMs).toISOString();

    await addFollowUp(effectiveLeadId, {
      followUpAt,
      notes: resolution.nextAction,
      assignedTo: "auto-scheduler",
    });

    // 4. Re-queue call in BullMQ
    followUpJob = await callQueue.add(
      "initiate-call",
      {
        clientName,
        clientNumber,
        clientRequirement,
        clientOtherDetails: clientOtherDetails || {},
        attemptCount: ((clientOtherDetails && clientOtherDetails.attemptCount) ?? 0) + 1,
        scheduledAt: followUpAt,
        previousResolution: resolution.resolution,
      },
      { delay: delayMs }
    );

    console.log(`[Lead Service] Follow-up queued | jobId=${followUpJob.id} | delay=${resolution.followUpDelayMinutes}min`);
  }

  return {
    resolution,
    shouldFollowUp,
    followUpJobId: followUpJob ? followUpJob.id : null,
  };
}

/**
 * Fetches today's leads from CRM and queues them staggering by 20s
 */
export async function fetchAndStaggerTodayLeads() {
  const leads = await fetchTodayLeads();

  if (!leads.length) {
    return [];
  }

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
      jobId: `lead-${lead.id}-${Date.now()}`,
    },
  }));

  const jobs = await callQueue.addBulk(bulkJobs);

  return jobs.map((job, i) => ({
    jobId: job.id,
    clientName: leads[i].clientName,
    clientNumber: leads[i].clientNumber,
    scheduledAt: bulkJobs[i].data.scheduledAt,
  }));
}

/**
 * Fetches all leads stored in the database
 */
export async function getAllLeads() {
  return await Lead.find({}).sort({ createdAt: -1 });
}
