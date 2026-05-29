import { Router } from "express";
import leadRouter from "./lead.routes.js";
import webhookRouter from "./webhook.routes.js";

const router = Router();

// Structured paths
router.use("/lead", leadRouter);
router.use("/webhooks", webhookRouter);

// Fallback paths for backward compatibility
router.use("/", leadRouter);
router.use("/", webhookRouter);

export default router;
