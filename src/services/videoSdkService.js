// src/services/videoSdkService.js
import "dotenv/config";

const VIDEOSDK_TOKEN = process.env.VIDEOSDK_AUTH_TOKEN;
const SIP_CALL_FROM = process.env.VIDEOSDK_SIP_CALL_FROM;
const ROUTING_RULE_ID = process.env.VIDEOSDK_ROUTING_RULE_ID;

/**
 * Create a new VideoSDK Room
 * @param {string} customRoomId - Custom unique identifier for the room
 * @returns {Promise<object|null>} The created room data
 */
export async function createRoom(customRoomId) {
  try {
    const payload = {
      customRoomId: customRoomId || `room-${Date.now()}`
    };

    // Attach webhook subscription if URL is provided in env
    const webhookUrl = process.env.VIDEOSDK_WEBHOOK_URL ;
    
    if (webhookUrl) {
      payload.webhook = {
        endPoint: webhookUrl,
        events: [
          "merge-recording-completed",
          "transcription-completed"
        ]
      };
      console.log(`[VideoSDK] Registering webhook subscriptions at endpoint: ${webhookUrl}`);
    }

    console.log(`[VideoSDK] Creating room with customRoomId: "${payload.customRoomId}"`);

    const response = await fetch("https://api.videosdk.live/v2/rooms", {
      method: "POST",
      headers: {
        "Authorization": VIDEOSDK_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[VideoSDK] ✅ Room created successfully | roomId=${data.roomId}`);
      return data;
    } else {
      const errorText = await response.text();
      console.error(`[VideoSDK] ❌ Room creation failed: ${response.status} — ${errorText}`);
      return null;
    }
  } catch (err) {
    console.error(`[VideoSDK] ❌ Error creating room: ${err.message}`);
    return null;
  }
}

/**
 * Ek number pe outbound call trigger karo via VideoSDK
 * @param {string} sipCallTo - Recipient's phone number
 * @param {string} name - Recipient's name for metadata
 * @param {string} company - Company name for metadata (default: 'Rentopus')
 * @param {string} language - Language for the agent (default: 'hinglish')
 * @param {string} roomId - Optional VideoSDK room ID to connect the call to
 */
export async function triggerCall(sipCallTo, name = "Customer", company = "Rentopus", language = "hinglish", roomId = null) {
  try {
    const payload = {
      sipCallFrom: SIP_CALL_FROM,
      sipCallTo: sipCallTo,
      routingRuleId: ROUTING_RULE_ID,
      metadata: {
        language: language,
        customerName: name,
        phone: sipCallTo
      }
    };

    if (roomId) {
      payload.roomId = roomId;
      payload.destinationRoomId = roomId;
      payload.metadata.roomId = roomId;
    }

    console.log(`[VideoSDK] Sending call request payload:`, JSON.stringify(payload, null, 2));

    const response = await fetch("https://api.videosdk.live/v2/sip/call", {
      method: "POST",
      headers: {
        "Authorization": VIDEOSDK_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[VideoSDK] ✅ Call triggered → ${sipCallTo}`);
      return data;
    } else {
      const errorText = await response.text();
      console.error(`[VideoSDK] ❌ Error: ${response.status} — ${errorText}`);
      return null;
    }
  } catch (err) {
    console.error(`[VideoSDK] ❌ Error triggering call: ${err.message}`);
    return null;
  }
}

/**
 * Fetch merge recording details for a given roomId and recordingId
 * @param {string} roomId
 * @param {string} recordingId
 * @returns {Promise<object|null>}
 */
export async function fetchMergeRecordingDetails(roomId, recordingId) {
  try {
    const url = `https://api.videosdk.live/v2/recordings/participant/merge?roomId=${roomId}`;
    const token = process.env.VIDEOSDK_AUTH_TOKEN;

    if (!token) {
      console.error(`[VideoSDK] No token available to fetch recording details`);
      return null;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": token,
        "Content-Type": "application/json"
      }
    });

    if (response.ok) {
      const data = await response.json();
      const recordings = data.recordings || (Array.isArray(data) ? data : []);
      const matched = recordings.find((r) => r.id === recordingId);
      if (matched) {
        console.log(`[VideoSDK] Found merge recording details for id: ${recordingId}`);
        return matched;
      }
      console.warn(`[VideoSDK] Recording with id ${recordingId} not found in room recordings list`);
      return null;
    } else {
      const errText = await response.text();
      console.error(`[VideoSDK] Failed to fetch recordings: ${response.status} - ${errText}`);
      return null;
    }
  } catch (err) {
    console.error(`[VideoSDK] Error fetching recording details: ${err.message}`);
    return null;
  }
}

