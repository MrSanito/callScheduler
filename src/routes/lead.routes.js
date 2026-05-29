import { Router } from "express";
import { createLead, getTodayFollowup, getAllLeads } from "../controllers/lead.controller.js";

const router = Router();

router.post("/newLeadsScheduleCall", createLead); // single call at once triggered by button click in UI
router.get("/todayFollowup", getTodayFollowup); // triggered by cronjob daily

// Frontend Routes 
router.get("/leads", getAllLeads);

    export default router;
