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
