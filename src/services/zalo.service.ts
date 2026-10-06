import axios from "axios";

export const sendZaloMessage = async (chatId: string, text: string): Promise<void> => {
    const token = process.env.ZALO_BOT_TOKEN;
    if (!token) throw new Error("Missing ZALO_BOT_TOKEN");

    await axios.post(`https://bot-api.zaloplatforms.com/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
    });
};
