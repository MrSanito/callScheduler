# Call Scheduler

Express + BullMQ + Gemini Flash — automated call scheduling for Rentopus CRM.

## Architecture

```
Client
  │
  ├── POST /api/v1/scheduleCall     → validates → pushes job to Redis/BullMQ
  ├── POST /api/v1/callResolution   → Gemini parses transcript → CRM update → re-queues follow-up
  └── GET  /api/v1/leadList         → fetches today's leads from CRM → bulk-queues all

Redis (BullMQ)
  └── call-queue
        └── Worker picks job when due → initiateCall() → telephony API
```

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# fill in GEMINI_API_KEY, REDIS_URL, CRM credentials

# 3. Start Redis (Docker)
docker run -d -p 6379:6379 redis:alpine

# 4. Run server + worker in separate terminals
npm run dev          # terminal 1 — Express server
npm run dev:worker   # terminal 2 — BullMQ worker
```

## API Reference

### POST /api/v1/scheduleCall
Schedule a new lead call.
```json
{
  "clientName": "Vishal Patel",
  "clientNumber": "+916353778872",
  "clientRequirement": "2BHK flat in Ahmedabad, budget 50L",
  "clientOtherDetails": { "source": "website", "priority": "high" },
  "delayMinutes": 0
}
```

### POST /api/v1/callResolution
Process a completed call — Gemini parses the transcript and schedules follow-up.
```json
{
  "leadId": 1,
  "clientName": "Vishal Patel",
  "clientNumber": "+916353778872",
  "clientRequirement": "2BHK flat in Ahmedabad, budget 50L",
  "clientOtherDetails": { "source": "website" },
  "transcript": {
    "agent": "Hello, is this Vishal?",
    "client": "Yes, I'm looking for a 2BHK near Prahlad Nagar under 50L.",
    "agent": "We have some great options. Shall I send you details?",
    "client": "Yes please, call me back in 2 days."
  }
}
```

### GET /api/v1/leadList
Fetch today's leads and bulk-schedule all calls (staggered by 5 min).
```bash
curl http://localhost:3000/api/v1/leadList
```

## Adding Telephony
In `src/worker.js`, replace the `initiateCall` stub with your provider:
- **Exotel**: `POST https://{api_key}:{api_token}@api.exotel.com/v1/Accounts/{sid}/Calls/connect`
- **Twilio**: `twilioClient.calls.create({ to, from, url })`
- **Plivo**: `plivoClient.calls.create({ from, to, answer_url })`
