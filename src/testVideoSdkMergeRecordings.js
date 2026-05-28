// src/testVideoSdkMergeRecordings.js
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";

// Always resolve the .env file relative to this script's directory (go up one level from 'src')
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Generate a JWT token dynamically using API Key and Secret,
 * or fall back to the pre-configured AUTH_TOKEN.
 * @returns {string} The JWT token to use in the Authorization header
 */
function getVideoSdkToken() {
  const apiKey = process.env.VIDEOSDK_API_KEY;
  const apiSecret = process.env.VIDEOSDK_API_SECRET;

  if (apiKey && apiSecret) {
    const header = { alg: "HS256", typ: "JWT" };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 120 * 60; // Token valid for 2 hours

    const payload = {
      apikey: apiKey,
      permissions: ["allow_join"],
      version: 2,
      role: "crawler",
      iat,
      exp
    };

    const base64UrlEncode = (obj) => {
      return Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(payload);

    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    return `${headerEncoded}.${payloadEncoded}.${signature}`;
  }

  // Fallback to static token
  return process.env.VIDEOSDK_AUTH_TOKEN;
}

async function runFetchMergeRecordings() {
  console.log("==================================================");
  console.log("VideoSDK Fetch All Merge Recordings Script");
  console.log("==================================================");

  // Resolve token
  const token = getVideoSdkToken();
  if (!token) {
    console.error("❌ ERROR: No VideoSDK token found in environment variables.");
    process.exit(1);
  }

  // Check token source
  const isDynamic = process.env.VIDEOSDK_API_KEY && process.env.VIDEOSDK_API_SECRET;
  console.log(`Token Source: ${isDynamic ? "Dynamic JWT (Generated from API Key & Secret)" : "Static Fallback Token (VIDEOSDK_AUTH_TOKEN)"}`);
  console.log(`Token Preview: ${token.substring(0, 15)}...${token.substring(token.length - 15)}`);
  console.log("--------------------------------------------------");

  // Define URL with optional query parameters (status, roomId, sessionId, id)
  // Edit these values or add parameters as needed
  const baseUrl = "https://api.videosdk.live/v2/recordings/participant/merge";
  const params = new URLSearchParams();
  
  // Example optional filters (uncomment or edit to filter):
  // params.append("status", "completed"); // completed or failed
  // params.append("roomId", "e548-ez2o-bpk4");
  // params.append("sessionId", "6847c231fbaa8b416bc87014");

  const queryStr = params.toString();
  const url = queryStr ? `${baseUrl}?${queryStr}` : baseUrl;
  
  console.log(`Fetching from URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": token,
        "Content-Type": "application/json"
      }
    });

    console.log("--------------------------------------------------");
    if (response.ok) {
      const data = await response.json();
      console.log("✅ Response Status: Success (200)");
      console.log(`Retrieved ${Array.isArray(data) ? data.length : "object"} merge recording record(s).`);

      // Save response to a local file
      const outputPath = path.resolve(__dirname, "../merge_recordings_response.json");
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
      
      console.log(`\n💾 Saved response data successfully to:\n👉 ${outputPath}\n`);
      console.log("Preview of response data:");
      console.log(JSON.stringify(Array.isArray(data) ? data.slice(0, 2) : data, null, 2));
    } else {
      const errorText = await response.text();
      console.error(`❌ Response Status: Failed (${response.status}) — ${errorText}`);
    }
  } catch (err) {
    console.error(`❌ Fetch Error: ${err.message}`);
  }
  console.log("==================================================");
}

runFetchMergeRecordings();
