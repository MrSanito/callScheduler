import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * ==========================================
 * MONGOOSE SCHEMAS & MODELS FOR CALL SCHEDULER
 * ==========================================
 * 
 * MongoDB/Mongoose equivalence of your Prisma Schema.
 * Includes schema indexing, enumerations, relational mapping,
 * serverless safety checks, and TypeScript interfaces.
 */

// ── 1. LEAD MODEL ─────────────────────────────────────────────────────────────
export interface ILead extends Document {
  clientName: string;
  shopName?: string;
  clientNumber: string;
  clientRequirement: string;
  clientOtherDetails: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema: Schema<ILead> = new Schema(
  {
    clientName: { type: String, required: true, trim: true },
    shopName: { type: String, trim: true, default: "" },
    clientNumber: { type: String, required: true, unique: true, trim: true },
    clientRequirement: { type: String, required: true },
    clientOtherDetails: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Indexes for ultra-fast lead retrieval by phone number
LeadSchema.index({ clientNumber: 1 });

export const Lead: Model<ILead> = 
  mongoose.models.Lead || mongoose.model<ILead>("Lead", LeadSchema);


// ── 2. VIDEOSDK ROOM MODEL ────────────────────────────────────────────────────
export interface IVideoSdkRoom extends Document {
  roomId: string;
  customRoomId: string;
  userId?: string | null;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VideoSdkRoomSchema: Schema<IVideoSdkRoom> = new Schema(
  {
    roomId: { type: String, required: true, unique: true, trim: true },
    customRoomId: { type: String, required: true, unique: true, trim: true },
    userId: { type: String, default: null },
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes for looking up rooms
VideoSdkRoomSchema.index({ roomId: 1 });
VideoSdkRoomSchema.index({ customRoomId: 1 });

export const VideoSdkRoom: Model<IVideoSdkRoom> = 
  mongoose.models.VideoSdkRoom || mongoose.model<IVideoSdkRoom>("VideoSdkRoom", VideoSdkRoomSchema);


// ── 3. CALL RECORDING MODEL ───────────────────────────────────────────────────
export interface ICallRecording extends Document {
  recordingId: string;
  callId: mongoose.Types.ObjectId;
  type: "audio" | "video" | "merge";
  status: "running" | "completed" | "failed";
  fileUrl?: string | null;
  filePath?: string | null;
  size?: number | null;
  duration?: number | null;
  format: string;
  createdAt: Date;
  updatedAt: Date;
}

const CallRecordingSchema: Schema<ICallRecording> = new Schema(
  {
    recordingId: { type: String, required: true, unique: true, trim: true },
    callId: { type: Schema.Types.ObjectId, ref: "CallHistory", required: true },
    type: { type: String, enum: ["audio", "video", "merge"], default: "merge" },
    status: { type: String, enum: ["running", "completed", "failed"], default: "running" },
    fileUrl: { type: String, default: null },
    filePath: { type: String, default: null },
    size: { type: Number, default: null },
    duration: { type: Number, default: null },
    format: { type: String, default: "mp3" },
  },
  { timestamps: true }
);

CallRecordingSchema.index({ recordingId: 1 });
CallRecordingSchema.index({ callId: 1 });

export const CallRecording: Model<ICallRecording> = 
  mongoose.models.CallRecording || mongoose.model<ICallRecording>("CallRecording", CallRecordingSchema);


// ── 4. TRANSCRIPT UTTERANCE SCHEMA ────────────────────────────────────────────
export interface ITranscript extends Document {
  callId: mongoose.Types.ObjectId;
  role: "user" | "assistant" | "agent" | "system";
  content: string;
  timestamp: Date;
  createdAt: Date;
}

const TranscriptSchema: Schema<ITranscript> = new Schema(
  {
    callId: { type: Schema.Types.ObjectId, ref: "CallHistory", required: true },
    role: { type: String, enum: ["user", "assistant", "agent", "system"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TranscriptSchema.index({ callId: 1 });

export const Transcript: Model<ITranscript> = 
  mongoose.models.Transcript || mongoose.model<ITranscript>("Transcript", TranscriptSchema);


// ── 5. CALL HISTORY MODEL ─────────────────────────────────────────────────────
export interface ICallHistory extends Document {
  leadId: mongoose.Types.ObjectId;
  roomId?: string | null; // Connects via VideoSdkRoom roomId
  attemptCount: number;
  scheduledAt?: Date | null;
  startedAt: Date;
  endedAt?: Date | null;
  duration?: number | null; // duration in seconds
  status: "pending" | "active" | "completed" | "failed" | "busy" | "no_answer" | "accepted" | "rejected";
  sentiment?: string | null;
  summary?: string | null;
  nextAction?: string | null;
  resolution?: "trial_setup" | "busy" | "wrong_number" | "not_interested" | "deal_closed" | null;
  createdAt: Date;
  updatedAt: Date;
}

const CallHistorySchema: Schema<ICallHistory> = new Schema(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    roomId: { type: String, ref: "VideoSdkRoom", default: null }, // Maps directly to roomId inside VideoSdkRoom
    attemptCount: { type: Number, default: 1 },
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: null },
    status: { 
      type: String, 
      enum: ["pending", "active", "completed", "failed", "busy", "no_answer", "accepted", "rejected"], 
      default: "pending" 
    },
    sentiment: { type: String, default: null },
    summary: { type: String, default: null },
    nextAction: { type: String, default: null },
    resolution: { 
      type: String, 
      enum: ["trial_setup", "busy", "wrong_number", "not_interested", "deal_closed", null], 
      default: null 
    },
  },
  { timestamps: true }
);

// Compound indexing for history queries
CallHistorySchema.index({ leadId: 1 });
CallHistorySchema.index({ roomId: 1 });
CallHistorySchema.index({ status: 1 });

export const CallHistory: Model<ICallHistory> = 
  mongoose.models.CallHistory || mongoose.model<ICallHistory>("CallHistory", CallHistorySchema);
