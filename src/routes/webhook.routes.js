import { Router } from "express";
import * as webhookController from "../controllers/webhook.controller.js";

const router = Router();

router.post("/transcript", webhookController.handleTranscript);
router.post("/recording", webhookController.handleRecording);
router.post("/call-answered", webhookController.handleCallAnswered);
router.post("/call-missed", webhookController.handleCallMissed);
router.post("/call-transferred", webhookController.handleCallTransferred);

export default router;
