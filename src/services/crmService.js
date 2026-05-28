// src/services/crmService.js
// Fake Rentopus CRM service. Replace console.logs with real axios calls later.

/**
 * PUT /api/updateLead/?id=:leadId
 * Updates a lead in the CRM after call resolution.
 */
async function updateLead(leadId, updatePayload) {
  console.log(
    `[CRM]  PUT /api/updateLead/?id=${leadId} | payload=${JSON.stringify(updatePayload)}`
  );

  // TODO: replace with real HTTP call
  // await axios.put(`${process.env.CRM_BASE_URL}/api/updateLead/?id=${leadId}`, updatePayload, {
  //   headers: { Authorization: `Bearer ${process.env.CRM_API_KEY}` },
  // });

  return { success: true, leadId, updated: updatePayload };
}

/**
 * POST /api/addfollowup/leadId=:leadId
 * Adds a follow-up entry for a lead.
 */
async function addFollowUp(leadId, followUpPayload) {
  console.log(
    `[CRM]  POST /api/addfollowup/leadId=${leadId} | payload=${JSON.stringify(followUpPayload)}`
  );

  // TODO: replace with real HTTP call
  // await axios.post(`${process.env.CRM_BASE_URL}/api/addfollowup/leadId=${leadId}`, followUpPayload, {
  //   headers: { Authorization: `Bearer ${process.env.CRM_API_KEY}` },
  // });

  return { success: true, leadId, followUp: followUpPayload };
}

/**
 * GET /api/LeadList
 * Fetches today's leads from the CRM.
 * Returns dummy data until wired to real CRM.
 */
async function fetchTodayLeads() {
  console.log(`[CRM]  GET /api/LeadList | fetching today's leads...`);

  // TODO: replace with real HTTP call
  // const { data } = await axios.get(`${process.env.CRM_BASE_URL}/api/LeadList`, {
  //   headers: { Authorization: `Bearer ${process.env.CRM_API_KEY}` },
  // });
  // return data;

  // --- DUMMY DATA ---
  const dummyLeads = [
    {
      id: 1,
      clientName: "Vishal Patel",
      clientNumber: "+916353778872",
      clientRequirement: "2BHK flat in Ahmedabad, budget 50L",
      clientOtherDetails: { source: "website", priority: "high", createdAt: new Date().toISOString() },
    },
    {
      id: 2,
      clientName: "Ravi Shah",
      clientNumber: "+919876543210",
      clientRequirement: "3BHK in Surat near VIP Road, budget 80L",
      clientOtherDetails: { source: "referral", priority: "medium", createdAt: new Date().toISOString() },
    },
    {
      id: 3,
      clientName: "Priya Mehta",
      clientNumber: "+917654321098",
      clientRequirement: "1BHK for investment in Vadodara, budget 25L",
      clientOtherDetails: { source: "IVR", priority: "low", createdAt: new Date().toISOString() },
    },
  ];

  console.log(`[CRM]  GET /api/LeadList | fetched ${dummyLeads.length} leads`);
  return dummyLeads;
}

/**
 * Saves VideoSDK Room details to DB
 * @param {string|number} leadId - Lead ID
 * @param {object} roomData - VideoSDK created room response object
 */
async function saveVideoSdkRoom(leadId, roomData) {
  console.log(`[DB]   ✅ Saved VideoSDK Room to DB for Lead: ${leadId}`);
  console.log(`[DB]   VideoSDK room ID: ${roomData.roomId} (SDK database ID: ${roomData.id})`);
  
  // TODO: Replace with real database query (e.g. Prisma or direct SQL save)
  // await db.leadRooms.create({ data: { leadId, roomId: roomData.roomId, videoSdkId: roomData.id, rawResponse: roomData } });

  return { success: true };
}

export { updateLead, addFollowUp, fetchTodayLeads, saveVideoSdkRoom };
