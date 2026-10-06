import express from "express";
import { zaloBotWebhook } from "../webhooks/zalo_bot.webhook";

const indexRouter = express.Router();

indexRouter.post("/api/webhook/zalo", zaloBotWebhook);

export default indexRouter;