import mongoose from "mongoose";
import { Lead, CallHistory, CallRecording, Transcript } from "../models/mongooseModels.js";
import { parseTranscript } from "./geminiService.js";
import { fetchMergeRecordingDetails } from "./videoSdkService.js";
import { callQueue } from "../queues/callQueue.js";
import * as mm from "music-metadata";

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
 * Parses audio duration using music-metadata from a remote CDN URL
 */
export async function getAudioDuration(fileUrl) {
  try {
    const fileResponse = await fetch(fileUrl);
    const buffer = await fileResponse.arrayBuffer();
    const nodeBuffer = Buffer.from(buffer);

    const metadata = await mm.parseBuffer(nodeBuffer, {
      mimeType: fileResponse.headers.get('content-type') || 'audio/mpeg'
    });

    const durationSeconds = metadata.format.duration;
    const durationMinutes = (durationSeconds / 60).toFixed(2);

    console.log(`Duration: ${durationSeconds}s = ${durationMinutes} mins`);

    return {
      seconds: durationSeconds,
      minutes: durationMinutes,
      formatted: `${Math.floor(durationSeconds / 60)}m ${Math.floor(durationSeconds % 60)}s`
    };
  } catch (err) {
    console.error('Error getting duration:', err.message);
    return null;
  }
}

/**
 * Processes transcription callback (saves raw lines, parses with Gemini, sets statuses, re-queues if needed)
 */
export async function processTranscriptWebhook({ serviceRoomId, roomId, clientNumber, phone, contactNo, data = {}, transcript, usage, contextHistory, agentLanguage, customerName, noAnswer, reason }) {
  const finalRoomId = serviceRoomId || roomId || data.meetingId || data.roomId;
  const rawPhone = clientNumber || phone || contactNo || data.clientNumber || data.phone || data.contactNo;

  if (!finalRoomId && !rawPhone) {
    throw new Error("Either roomId or clientNumber/phone must be provided");
  }

  let callHistory = null;
  let lead = null;

  // 1. Locate Call History and Lead
  if (finalRoomId) {
    console.log(`[Webhook Service] Locating call history by roomId: ${finalRoomId}`);
    callHistory = await CallHistory.findOne({ roomId: finalRoomId }).populate("leadId");
    if (callHistory) {
      lead = callHistory.leadId;
    }
  }

  if (!callHistory && rawPhone) {
    const cleanNumber = normalizePhoneNumber(rawPhone);
    console.log(`[Webhook Service] Locating call history by phone number: ${cleanNumber}`);
    lead = await Lead.findOne({ clientNumber: cleanNumber });
    if (lead) {
      callHistory = await CallHistory.findOne({ leadId: lead._id }).sort({ createdAt: -1 });
      if (callHistory) {
        callHistory.leadId = lead;
      }
    }
  }

  if (!callHistory) {
    throw new Error(`Call history not found for roomId: ${finalRoomId} or phone: ${rawPhone}`);
  }

  if (!lead) {
    throw new Error("Associated lead not found");
  }

  // ── Early exit: No Answer (recipient didn't pick up) ──
  if (noAnswer) {
    console.log(`[Webhook Service] 📵 Call not answered for room: ${finalRoomId} | reason: ${reason}`);
    callHistory.status = "no_answer";
    callHistory.endedAt = new Date();
    callHistory.resolution = "no_answer";
    if (agentLanguage) callHistory.agentLanguage = agentLanguage;
    if (customerName)  callHistory.customerName  = customerName;

    // Calculate duration from startedAt to now
    if (callHistory.startedAt) {
      callHistory.duration = Math.round((callHistory.endedAt.getTime() - callHistory.startedAt.getTime()) / 1000);
    }
    await callHistory.save();

    // Update lead status — stop retrying after 3 attempts
    if (lead.totalAttempts >= 3) {
      lead.status = "failed";
      await lead.save();
      console.log(`[Webhook Service] ⛔ Lead ${lead._id} reached max 3 attempts. Marked as 'failed', no more retries.`);
    } else {
      lead.status = "pending";
      await lead.save();
      console.log(`[Webhook Service] Lead ${lead._id} reset to 'pending' for retry (attempt ${lead.totalAttempts}/3)`);
    }

    return {
      callId: callHistory._id.toString(),
      leadId: lead._id.toString(),
      status: "no_answer",
      reason: reason || "recipient_did_not_join",
    };
  }

  // 1.5. Save raw transcript lines to the Transcript collection
  if (transcript) {
    try {
      if (typeof transcript === "string") {
        const lines = transcript.split("\n");
        let savedCount = 0;
        for (const line of lines) {
          if (!line.trim()) continue;
          
          let role = "user";
          let content = line.trim();
          
          const colonIndex = line.indexOf(":");
          if (colonIndex !== -1) {
            const speaker = line.substring(0, colonIndex).trim().toLowerCase();
            const text = line.substring(colonIndex + 1).trim();
            
            if (speaker.includes("agent") || speaker.includes("assistant")) {
              role = "agent";
            } else if (speaker.includes("user") || speaker.includes("customer") || speaker.includes("client")) {
              role = "user";
            } else if (speaker.includes("system")) {
              role = "system";
            } else {
              role = "user";
            }
            content = text;
          }
          
          await Transcript.create({
            callId: callHistory._id,
            role,
            content,
          });
          savedCount++;
        }
        console.log(`[Webhook Service] Saved ${savedCount} transcript lines (string style) to DB`);
      } else if (Array.isArray(transcript)) {
        let count = 0;
        for (const item of transcript) {
          let role = item.role || item.speaker || "user";
          const content = item.content || item.text || item.message || "";
          if (!content) continue;
          
          role = role.toString().toLowerCase();
          if (role.includes("agent")) role = "agent";
          else if (role.includes("assistant")) role = "assistant";
          else if (role.includes("system")) role = "system";
          else role = "user";
          
          await Transcript.create({
            callId: callHistory._id,
            role,
            content,
          });
          count++;
        }
        console.log(`[Webhook Service] Saved ${count} transcript items (array style) to DB`);
      } else if (typeof transcript === "object") {
        let role = transcript.role || transcript.speaker || "user";
        const content = transcript.content || transcript.text || transcript.message || "";
        if (content) {
          role = role.toString().toLowerCase();
          if (role.includes("agent")) role = "agent";
          else if (role.includes("assistant")) role = "assistant";
          else if (role.includes("system")) role = "system";
          else role = "user";
          
          await Transcript.create({
            callId: callHistory._id,
            role,
            content,
          });
          console.log(`[Webhook Service] Saved 1 transcript item (object style) to DB`);
        }
      }
    } catch (dbErr) {
      console.error(`[Webhook Service] ❌ Failed to save transcript utterances:`, dbErr.message);
    }
  }

  // 2. Parse the transcript with Google Gemini
  let resolution = {
    resolution: "no_answer",
    sentiment: "neutral",
    summary: "No summary generated.",
    nextAction: "None",
    followUpDelayMinutes: 120,
  };

  if (transcript) {
    try {
      resolution = await parseTranscript(transcript, {
        clientName: lead.clientName,
        clientRequirement: lead.clientRequirement,
        clientOtherDetails: lead.clientOtherDetails,
      });
    } catch (geminiErr) {
      console.error(`[Webhook Service] ❌ Gemini analysis failed:`, geminiErr.message);
    }
  } else {
    console.log(`[Webhook Service] Empty transcript received. Proceeding with defaults.`);
  }

  // 3. Update Call History record
  callHistory.status = "completed";
  callHistory.endedAt = new Date();
  callHistory.sentiment = resolution.sentiment;
  callHistory.summary = resolution.summary;
  callHistory.nextAction = resolution.nextAction;
  callHistory.resolution = resolution.resolution;

  // Save raw transcript string
  if (transcript) {
    callHistory.rawTranscript = typeof transcript === "string"
      ? transcript
      : JSON.stringify(transcript, null, 2);
  }

  if (usage && typeof usage === "object") {
    callHistory.tokenUsage = usage;
    console.log(`[Webhook Service] Token usage saved: total=${usage.totals?.total_tokens} | turns=${usage.turnCount}`);
  }

  if (agentLanguage) callHistory.agentLanguage = agentLanguage;
  if (customerName)  callHistory.customerName  = customerName;
  if (contextHistory && Array.isArray(contextHistory)) {
    callHistory.contextHistory = contextHistory;
  }
  
  if (callHistory.startedAt) {
    callHistory.duration = Math.round((callHistory.endedAt.getTime() - callHistory.startedAt.getTime()) / 1000);
  }
  await callHistory.save();

  // 4. Update Lead Document status
  const terminalCompletedResolutions = ["interested", "deal_closed", "trial_setup"];
  const terminalFailedResolutions = ["not_interested", "wrong_number"];

  if (terminalCompletedResolutions.includes(resolution.resolution)) {
    lead.status = "completed";
  } else if (terminalFailedResolutions.includes(resolution.resolution)) {
    lead.status = "failed";
  } else {
    lead.status = "active";
  }
  await lead.save();

  console.log(`[Webhook Service] Updated Lead ${lead._id} to status: ${lead.status}`);

  // 5. Re-Queue Logic
  const isTerminal = [...terminalCompletedResolutions, ...terminalFailedResolutions].includes(resolution.resolution);
  const attemptCount = callHistory.attemptCount;

  let reQueued = false;
  let nextScheduledAt = null;

  if (!isTerminal && attemptCount < 3) {
    const DELAY_MS = 2 * 60 * 60 * 1000; 
    nextScheduledAt = new Date(Date.now() + DELAY_MS);
    const nextAttempt = attemptCount + 1;

    const jobData = {
      leadId: lead._id.toString(),
      clientName: lead.clientName,
      shopName: lead.shopName || "",
      clientNumber: lead.clientNumber,
      clientRequirement: lead.clientRequirement,
      clientOtherDetails: lead.clientOtherDetails,
      attemptNum: nextAttempt,
    };

    const job = await callQueue.add("initiate-call", jobData, {
      delay: DELAY_MS,
      jobId: `lead-${lead._id.toString()}-attempt-${nextAttempt}-${Date.now()}`
    });

    reQueued = true;
    console.log(`[Webhook Service] 🔁 Re-queued next call (attempt #${nextAttempt}) with +2h delay | jobId=${job.id}`);
  } else {
    console.log(`[Webhook Service] No re-queue needed | isTerminal=${isTerminal} | attemptsMade=${attemptCount}`);
  }

  // 6. Sync Followup with CRM (Delayed 10s to ensure recording URL is present)
  setTimeout(async () => {
    try {
      console.log(`[CRM Followup Sync] Starting delayed followup sync for callId: ${callHistory._id}`);
      
      const recording = await CallRecording.findOne({ callId: callHistory._id });
      if (!recording || !recording.fileUrl) {
        console.warn(`[CRM Followup Sync] No recording or fileUrl found for callId: ${callHistory._id}`);
        return;
      }

      console.log(`[CRM Followup Sync] Downloading audio file from: ${recording.fileUrl}`);
      const audioResponse = await fetch(recording.fileUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio recording: ${audioResponse.statusText}`);
      }
      const audioBuffer = await audioResponse.arrayBuffer();

      const delayMinutes = resolution.followUpDelayMinutes || 120;
      const nextFollowupDate = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString().split("T")[0];

      const crmLeadId = lead.RcromId || (lead.clientOtherDetails && lead.clientOtherDetails.crmLeadId);
      if (!crmLeadId) {
        console.warn(`[CRM Followup Sync] No CRM Lead ID found for lead: ${lead._id}`);
        return;
      }

      const formData = new FormData();
      formData.append("LeadId", crmLeadId.toString());
      formData.append("Comment", resolution.summary || "Call Completed");
      formData.append("NextFollowup", nextFollowupDate);
      
      const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
      formData.append("AudioFile", audioBlob, "recording.mp3");

      console.log(`[CRM Followup Sync] Sending AddFolloupbyLeadId request for LeadId: ${crmLeadId}`);
      const crmResponse = await fetch("https://rcrm-api.rentopus.in/api/external/leads/AddFolloupbyLeadId", {
        method: "POST",
        headers: {
          "accept": "*/*",
          "X-API-Key": "Q6HP0ydkWpgp2wCKa3Lnc3zAVQEPlYzbg3JRpKEqz94"
        },
        body: formData
      });

      const responseText = await crmResponse.text();
      console.log(`[CRM Followup Sync] Response from CRM API: Status=${crmResponse.status} | Body=${responseText}`);

    } catch (err) {
      console.error(`[CRM Followup Sync] ❌ Error syncing followup with audio:`, err.message);
    }
  }, 10000);

  return {
    callId: callHistory._id,
    leadStatus: lead.status,
    reQueued,
    nextScheduledAt,
    resolution,
  };
}

/**
 * Handles completed merge recording events
 */
export async function handleRecordingCompleted(data, req) {
  const file = data.file || req.body.file || {};
  const fileMeta = file.meta || {};

  const roomId = req.body.serviceRoomId || req.body.roomId || data.meetingId || data.roomId;
  const recordingId = req.body.recordingId || data.id || `rec-${Date.now()}`;
  const fileUrl = req.body.fileUrl || req.body.recordingUrl || file.fileUrl || data.fileUrl || data.downloadUrl || null;
  const duration = req.body.duration || fileMeta.duration || data.duration ? Number(req.body.duration || fileMeta.duration || data.duration) : null;
  const size = req.body.size || file.size || data.size ? Number(req.body.size || file.size || data.size) : null;
  const format = req.body.format || fileMeta.format || "mp3";

  if (!roomId) {
    throw new Error("serviceRoomId, roomId, or data.meetingId is required");
  }

  console.log(`[Webhook Service] Processing recording details for room: ${roomId}`);

  const callHistory = await CallHistory.findOne({ roomId });
  if (!callHistory) {
    console.warn(`[Webhook Service] Call History not found for room: ${roomId}`);
    throw new Error(`Call history not found for room: ${roomId}`);
  }

  let finalFileUrl = fileUrl;
  let finalDuration = duration;
  let finalSize = size;
  let finalFormat = format;

  if (!finalFileUrl) {
    console.log(`[Webhook Service] fileUrl is null. Querying VideoSDK API for merge details...`);
    const details = await fetchMergeRecordingDetails(roomId, recordingId);
    if (details && details.file) {
      finalFileUrl = details.file.fileUrl || details.file.downloadUrl || null;
      finalDuration = details.file.meta?.duration || details.duration || null;
      finalSize = details.file.size || null;
      finalFormat = details.file.meta?.format || details.format || "mp3";
      console.log(`[Webhook Service] Successfully fetched details from VideoSDK API! fileUrl: ${finalFileUrl}`);
    } else {
      console.warn(`[Webhook Service] Could not fetch details from VideoSDK API for recording ${recordingId}`);
    }
  }

  if (finalFileUrl && !finalDuration) {
    console.log(`[Webhook Service] duration is null/0. Querying audio metadata to extract duration...`);
    const parsedDuration = await getAudioDuration(finalFileUrl);
    if (parsedDuration) {
      finalDuration = parsedDuration.seconds;
      console.log(`[Webhook Service] Successfully parsed duration: ${finalDuration}s`);
    }
  }

  let callRecording = await CallRecording.findOne({ recordingId });
  if (callRecording) {
    callRecording.fileUrl = finalFileUrl;
    callRecording.duration = finalDuration;
    callRecording.size = finalSize;
    callRecording.format = finalFormat || "mp3";
    callRecording.status = "completed";
    await callRecording.save();
    console.log(`[Webhook Service] ✅ Updated existing Call Recording ${recordingId}`);
  } else {
    callRecording = new CallRecording({
      recordingId,
      callId: callHistory._id,
      type: "merge",
      status: "completed",
      fileUrl: finalFileUrl,
      duration: finalDuration,
      size: finalSize,
      format: finalFormat || "mp3",
    });
    await callRecording.save();
    console.log(`[Webhook Service] ✅ Saved new Call Recording ${recordingId} for Call: ${callHistory._id}`);
  }

  if (finalDuration) {
    callHistory.duration = Math.round(Number(finalDuration));
    await callHistory.save();
    console.log(`[Webhook Service] ✅ Updated Call History ${callHistory._id} duration to: ${callHistory.duration}s`);
  }

  return { recordingId, callId: callHistory._id, fileUrl: finalFileUrl };
}

/**
 * Handles answered/missed/rejected call events
 */
export async function handleCallStatusUpdate(type, data, req) {
  const roomId = req.body.roomId || data.meetingId || data.roomId || req.body.serviceRoomId || data.roomId;
  if (!roomId) {
    console.warn(`[Webhook Service] No roomId found in call event payload:`, type);
    return;
  }

  console.log(`[Webhook Service] Updating call status for room ${roomId} to match event "${type}"`);
  
  const callHistory = await CallHistory.findOne({ roomId }).populate("leadId");
  if (!callHistory) {
    console.warn(`[Webhook Service] Call History not found for room: ${roomId} during event: ${type}`);
    return;
  }

  const lead = callHistory.leadId;

  const eventTime = data.timestamp ? new Date(data.timestamp) : new Date();

  if (type === "call-answered") {
    callHistory.status = "answered";
    callHistory.answeredAt = eventTime;
    await callHistory.save();
    console.log(`[Webhook Service] Call History ${callHistory._id} updated to status "answered"`);
  } else if (type === "call-missed" || type === "call-rejected") {
    const isMissed = type === "call-missed";
    callHistory.status = isMissed ? "missed" : "rejected";
    callHistory.endedAt = eventTime;
    callHistory.hangupAt = eventTime;
    callHistory.resolution = isMissed ? "no_answer" : "rejected";
    await callHistory.save();
    console.log(`[Webhook Service] Call History ${callHistory._id} updated to status "${callHistory.status}"`);

    if (lead) {
      if (lead.totalAttempts >= 3) {
        lead.status = "failed";
        await lead.save();
        console.log(`[Webhook Service] ⛔ Lead ${lead._id} reached max 3 attempts. Marked as 'failed', no more retries.`);
      } else {
        lead.status = "pending";
        await lead.save();
        console.log(`[Webhook Service] Lead ${lead._id} reset to 'pending' for retry (attempt ${lead.totalAttempts}/3)`);
      }
    }
  } else if (type === "call-transferred") {
    callHistory.status = "transferred";
    callHistory.transferTo = data.transferTo || null;
    callHistory.transferStatus = "success";
    callHistory.endedAt = eventTime;
    callHistory.hangupAt = eventTime;
    await callHistory.save();
    console.log(`[Webhook Service] Call History ${callHistory._id} updated to status "transferred"`);
  } else if (type === "transfer-failed") {
    callHistory.status = "transfer-failed";
    callHistory.transferTo = data.transferTo || null;
    callHistory.transferStatus = "failed";
    callHistory.endedAt = eventTime;
    callHistory.hangupAt = eventTime;
    await callHistory.save();
    console.log(`[Webhook Service] Call History ${callHistory._id} updated to status "transfer-failed"`);
  }
}
