/**
 * ==========================================
 * PRISMA SCHEMA DESIGN FOR CALL SCHEDULER
 * ==========================================
 * 
 * Yeh file aapke reference ke liye banayi gayi hai. Ismein detailed Prisma Schema 
 * (schema.prisma format) aur corresponding TypeScript types design kiye gaye hain.
 * Jab aap database integrate karenge, toh is schema ko direct copy-paste kar sakte hain!
 */

// ── 1. SCHEMA.PRISMA SOURCE CODE ──────────────────────────────────────────────
export const prismaSchemaDSL = `
datasource db {
  provider = "postgresql" // Ya "mysql" / "sqlite" / "mongodb" jo bhi aap use karein
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// 🏢 Leads Table
model Lead {
  id                 String        @id @default(uuid())
  clientName         String
  shopName           String?       // Shop name
  clientNumber       String        @unique // Phone number unique key
  clientRequirement  String
  clientOtherDetails Json?         // Priority, Source, Attempt rules dynamic details ke liye
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  
  // Call History linkage
  calls              CallHistory[]
}

// 📞 VideoSDK Room Details (Saves the created room mock response)
model VideoSdkRoom {
  id           String        @id @default(uuid()) // Internal ID
  roomId       String        @unique              // VideoSDK generated roomId (abc-xyzw-lmno)
  customRoomId String        @unique              // Custom ID passed to VideoSDK (job-123)
  userId       String?                            // VideoSDK user ID reference
  disabled     Boolean       @default(false)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  // Connections
  calls        CallHistory[]
}

// ⏳ Call History & Attempt Tracker
model CallHistory {
  id           String          @id @default(uuid())
  leadId       String
  lead         Lead            @relation(fields: [leadId], references: [id], onDelete: Cascade)
  
  roomId       String?
  room         VideoSdkRoom?   @relation(fields: [roomId], references: [roomId], onDelete: SetNull)
  
  attemptCount Int             @default(1) // Attempt number (1st call, 2nd call, etc.)
  scheduledAt  DateTime?                   // Call time scheduled
  startedAt    DateTime        @default(now())
  endedAt      DateTime?
  duration     Int?            // Call duration in seconds
  status       String          @default("pending") // pending, active, completed, failed, busy, no_answer

  // 🤖 LLM/Gemini Analysis Results
  sentiment    String?         // positive, neutral, negative
  summary      String?         // Abstract summary of conversation
  nextAction   String?         // Suggested next step
  resolution   String?         // trial_setup, busy, wrong_number, not_interested, deal_closed

  // Multi-relations
  recordings   CallRecording[]
  transcripts  Transcript[]

  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
}

// 💾 Call Recordings (Merged or participant tracks)
model CallRecording {
  id            String      @id @default(uuid())
  recordingId   String      @unique // VideoSDK's original recordingId
  callId        String
  call          CallHistory @relation(fields: [callId], references: [id], onDelete: Cascade)
  
  type          String      @default("merge") // audio, video, merge
  status        String      @default("running") // running, completed, failed
  fileUrl       String?     // VideoSDK CDN file download URL
  filePath      String?     // Internal storage path
  size          Int?        // Size in bytes
  duration      Int?        // Recording duration in seconds
  format        String      @default("mp3")

  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}

// 💬 Live Transcript Storage
model Transcript {
  id        String      @id @default(uuid())
  callId    String
  call      CallHistory @relation(fields: [callId], references: [id], onDelete: Cascade)
  
  role      String      // user, assistant, agent, system
  content   String      // The spoken text
  timestamp DateTime    @default(now()) // Utterance timestamp

  createdAt DateTime    @default(now())
}
`;

// ── 2. TYPESCRIPT DEFINITIONS (For direct code auto-completion) ──────────────────
export interface Lead {
  id: string;
  clientName: string;
  shopName?: string;
  clientNumber: string;
  clientRequirement: string;
  clientOtherDetails?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoSdkRoom {
  id: string;
  roomId: string;
  customRoomId: string;
  userId?: string | null;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallHistory {
  id: string;
  leadId: string;
  roomId?: string | null;
  attemptCount: number;
  scheduledAt?: Date | null;
  startedAt: Date;
  endedAt?: Date | null;
  duration?: number | null;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'busy' | 'no_answer' | 'accepted' | 'rejected';
  sentiment?: string | null;
  summary?: string | null;
  nextAction?: string | null;
  resolution?: 'trial_setup' | 'busy' | 'wrong_number' | 'not_interested' | 'deal_closed' | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CallRecording {
  id: string;
  recordingId: string;
  callId: string;
  type: 'audio' | 'video' | 'merge';
  status: 'running' | 'completed' | 'failed';
  fileUrl?: string | null;
  filePath?: string | null;
  size?: number | null;
  duration?: number | null;
  format: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transcript {
  id: string;
  callId: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  createdAt: Date;
}
