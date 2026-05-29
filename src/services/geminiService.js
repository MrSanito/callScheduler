import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

// Use gemini-2.5-flash — small, fast, cheap
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.2, // low temp = deterministic structured output
  },
});

/**
 * Parses a call transcript using Gemini Flash and returns structured resolution.
 *
 * @param {object|string} transcript  - Key-value pairs or raw text of the call
 * @param {object}        clientData  - { clientName, clientRequirement, clientOtherDetails }
 * @returns {Promise<ParsedResolution>}
 */
async function parseTranscript(transcript, clientData) {
  const transcriptText =
    typeof transcript === "string"
      ? transcript
      : !transcript
      ? ""
      : JSON.stringify(transcript, null, 2);

  const prompt = `
You are an AI assistant for a real estate CRM. Analyze the following sales call transcript and return a structured JSON resolution.

CLIENT CONTEXT:
- Name: ${clientData.clientName}
- Requirement: ${clientData.clientRequirement}
- Other Details: ${JSON.stringify(clientData.clientOtherDetails ?? {})}

CALL TRANSCRIPT:
${transcriptText}

Return ONLY a valid JSON object with this exact schema (no markdown, no extra text):
{
  "resolution": "<one of: interested | not_interested | callback_requested | no_answer | follow_up_needed | deal_closed>",
  "sentiment": "<one of: positive | neutral | negative>",
  "summary": "<2-3 sentence summary of what happened on the call>",
  "nextAction": "<clear description of the recommended next action for the sales agent>",
  "followUpDelayMinutes": <integer: suggested delay in minutes before next call. Use 1440 for next day, 2880 for 2 days, 60 for 1 hour, etc.>,
  "keyInsights": ["<insight 1>", "<insight 2>"],
  "urgency": "<one of: high | medium | low>",
  "budgetMentioned": "<budget range if mentioned, else null>",
  "locationPreference": "<location if mentioned, else null>"
}
`.trim();

  console.log(`[Gemini] Sending transcript to gemini-1.5-flash for parsing...`);

  const result = await model.generateContent(prompt);
  const rawText = result.response.text();

  console.log(`[Gemini] Raw response: ${rawText}`);

  let parsed;
  try {
    // Strip accidental markdown fences if present
    const clean = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error(`[Gemini] JSON parse error:`, err.message);
    throw new Error(`Gemini returned malformed JSON: ${rawText}`);
  }

  console.log(`[Gemini] Parsed resolution: ${parsed.resolution} | sentiment: ${parsed.sentiment} | followUp in ${parsed.followUpDelayMinutes}min`);

  return parsed;
}

/**
 * Analyzes raw leads from CRM and returns a cleaned-up, structured JSON array.
 *
 * @param {Array} leadsList
 * @returns {Promise<Array>}
 */
async function cleanupLeadsList(leadsList) {
  const prompt = `
You are an AI assistant. Analyze the following list of raw leads from a CRM and return a cleaned-up, structured JSON array.
Fix and clean the fields based on these instructions:
1. "name": Extract the actual person's name. If it is "unknown", "unkown", or contains a phone number (e.g., "samir patel - 9016666842"), clean it to just the name (e.g., "Samir Patel"). If no name can be found or inferred, keep "Unknown".
2. "contactNo": Normalize the phone number to standard Indian format (e.g. +91XXXXXXXXXX or clean digits).
3. "shopName": Clean and capitalize the shop/business name. If "unknown", "unkown", or empty, try to infer it from the comments/remarks or labels, otherwise set to null or a clean value.
4. "relatedDetails": Summarize the lead status, comments, remarks, and labels into a clear, concise english explanation of their current situation (e.g. "Called busy, demo video sent, doing rental business", "Switch off", "Interested but minor price issue", etc.).

RAW LEADS LIST:
${JSON.stringify(leadsList, null, 2)}

Return ONLY a valid JSON array of objects with the following schema (no markdown formatting, no code fences):
[
  {
    "RcromId": <number: lead ID>,
    "name": "<string: cleaned name>",
    "contactNo": "<string: normalized contact number>",
    "shopName": "<string: cleaned shop name, or null>",
    "relatedDetails": "<string: concise summary of comments/labels/status/remarks>"
  }
]
`.trim();

  console.log(`[Gemini] Sending ${leadsList.length} leads to gemini-2.5-flash for cleanup...`);

  const result = await model.generateContent(prompt);
  const rawText = result.response.text();

  let parsed;
  try {
    const clean = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error(`[Gemini] JSON parse error on cleanupLeadsList:`, err.message);
    throw new Error(`Gemini returned malformed JSON during leads cleanup: ${rawText}`);
  }

  console.log(`[Gemini] Successfully cleaned up ${parsed.length} leads`);
  return parsed;
}

export { parseTranscript, cleanupLeadsList };
