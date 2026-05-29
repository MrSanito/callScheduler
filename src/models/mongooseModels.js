// src/models/mongooseModels.js
import mongoose from "mongoose";

const { Schema } = mongoose;

// ── 1. LEAD SCHEMA ─────────────────────────────────────────────────────────────
const LeadSchema = new Schema(
  {
    RcromId: { type: Number, default: null },
    clientName: { type: String, required: true, trim: true },
    shopName: { type: String, trim: true, default: "" },
    clientNumber: { type: String, required: true, unique: true, trim: true },
    clientRequirement: { type: String, required: true },
    clientOtherDetails: { type: Schema.Types.Mixed, default: {} },
    status: { 
      type: String, 
      enum: ["pending", "active", "completed", "failed"], 
      default: "pending" 
    },
    totalAttempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

LeadSchema.index({ clientNumber: 1 });

export const Lead = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);

// ── 2. VIDEOSDK ROOM SCHEMA ───────────────────────────────────────────────────
const VideoSdkRoomSchema = new Schema(
  {
    roomId: { type: String, required: true, unique: true, trim: true },
    customRoomId: { type: String, required: true, unique: true, trim: true },
    userId: { type: String, default: null },
    disabled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

VideoSdkRoomSchema.index({ roomId: 1 });
VideoSdkRoomSchema.index({ customRoomId: 1 });

export const VideoSdkRoom = mongoose.models.VideoSdkRoom || mongoose.model("VideoSdkRoom", VideoSdkRoomSchema);

// ── 3. CALL RECORDING SCHEMA ──────────────────────────────────────────────────
const CallRecordingSchema = new Schema(
  {
    recordingId: { type: String, required: true, unique: true, trim: true },
    callId: { type: Schema.Types.ObjectId, ref: "CallHistory", required: true },
    type: { type: String, enum: ["audio", "video", "merge"], default: "merge" },
    status: { type: String, enum: ["running", "completed", "failed"], default: "running" },
    fileUrl: { type: String, default: null },
    filePath: { type: String, default: null },
    size: { type: Number, default: null },
    duration: { type: Number, default: null },
    format: { type: String, default: "mp3" }
  },
  { timestamps: true }
);

CallRecordingSchema.index({ recordingId: 1 });
CallRecordingSchema.index({ callId: 1 });

export const CallRecording = mongoose.models.CallRecording || mongoose.model("CallRecording", CallRecordingSchema);

// ── 4. TRANSCRIPT UTTERANCE SCHEMA ───────────────────────────────────────────
const TranscriptSchema = new Schema(
  {
    callId: { type: Schema.Types.ObjectId, ref: "CallHistory", required: true },
    role: { type: String, enum: ["user", "assistant", "agent", "system"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

TranscriptSchema.index({ callId: 1 });

export const Transcript = mongoose.models.Transcript || mongoose.model("Transcript", TranscriptSchema);

// ── 5. CALL HISTORY SCHEMA ────────────────────────────────────────────────────
const CallHistorySchema = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    roomId: { type: String, ref: "VideoSdkRoom", default: null }, // References VideoSdkRoom.roomId
    customRoomId: { type: String, default: null },
    attemptCount: { type: Number, default: 1 },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    hangupAt: { type: Date, default: null },
    duration: { type: Number, default: null },
    status: { 
      type: String, 
      enum: ["pending", "active", "completed", "failed", "busy", "no_answer", "accepted", "rejected", "answered", "missed", "transferred", "transfer-failed"], 
      default: "pending" 
    },
    transferTo: { type: String, default: null },
    transferStatus: { type: String, enum: ["success", "failed", null], default: null },
    sentiment: { type: String, default: null },
    summary: { type: String, default: null },
    nextAction: { type: String, default: null },
    resolution: { 
      type: String, 
      enum: ["trial_setup", "busy", "wrong_number", "not_interested", "deal_closed", "follow_up_needed", "interested", "callback_requested", "no_answer", null], 
      default: null 
    },
    tokenUsage: { type: Schema.Types.Mixed, default: null },
    rawTranscript: { type: String, default: null },
    contextHistory: { type: Schema.Types.Mixed, default: null },  // raw context history array from agent
    agentLanguage:  { type: String, default: null },              // language used in this call session
    customerName:   { type: String, default: null }               // customer name used by agent
  },
  { timestamps: true }
);

CallHistorySchema.index({ leadId: 1 });
CallHistorySchema.index({ roomId: 1 });
CallHistorySchema.index({ status: 1 });

export const CallHistory = mongoose.models.CallHistory || mongoose.model("CallHistory", CallHistorySchema);
