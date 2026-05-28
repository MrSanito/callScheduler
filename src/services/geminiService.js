import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use gemini-1.5-flash — small, fast, cheap
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
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
      : Object.entries(transcript)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");

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

export { parseTranscript };
