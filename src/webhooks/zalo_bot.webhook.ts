import express from "express";
import { handleReportMessage } from "../services/create_report.service";
import { sendZaloMessage } from "../services/zalo.service";

// Secret token set when registering the webhook with Zalo (sent in X-Bot-Api-Secret-Token).
// If ZALO_WEBHOOK_SECRET is not set, verification is skipped.
const WEBHOOK_SECRET = process.env.ZALO_WEBHOOK_SECRET;

export const zaloBotWebhook = async (req: express.Request, res: express.Response) => {

    if (WEBHOOK_SECRET && req.header("X-Bot-Api-Secret-Token") !== WEBHOOK_SECRET) {
        return res.status(401).json({ status: "unauthorized" });
    }


    // Ack right away so Zalo doesn't retry; process in the background.
    res.json({ status: "ok" });

    const result = req.body;
    const message = result?.message;
    if (result?.event_name !== "message.text.received" || !message?.text) return;
    if (message.chat?.chat_type && message.chat.chat_type !== "PRIVATE") return;

    const chatId = String(message.chat?.id ?? message.from?.id);
    try {
        await handleReportMessage({
            chatId,
            userId: String(message.from?.id ?? chatId),
            userName: message.from?.display_name ?? "Unknown",
            text: message.text,
        });
    } catch (err) {
        console.error("handle report failed:", err);
        await sendZaloMessage(chatId, "Có lỗi khi ghi báo cáo, bạn thử lại sau nhé.").catch(() => {});
    }
};
