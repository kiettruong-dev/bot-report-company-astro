import { searchAccounts } from "./sheet.service";
import { canViewAccounts } from "./user_map.service";
import { sendZaloMessage } from "./zalo.service";

const MAX_RESULTS = 10;

export const ACCOUNT_COMMAND_RE = /^\/acc(?:@\S+)?(?:\s+([\s\S]*))?$/i;

/** Handles "/acc <keyword>": lists Accounts rows whose project/domain contains the keyword. */
export const handleAccountSearch = async (chatId: string, userId: string, content: string): Promise<void> => {
    if (!canViewAccounts(userId)) {
        await sendZaloMessage(chatId, "Bạn không có quyền xem thông tin tài khoản.");
        return;
    }

    const query = (content.match(ACCOUNT_COMMAND_RE)?.[1] ?? "").trim();
    if (!query) {
        await sendZaloMessage(chatId, "Cú pháp: /acc <từ khóa>. Ví dụ: /acc n8n");
        return;
    }

    const rows = await searchAccounts(query);
    if (rows.length === 0) {
        await sendZaloMessage(chatId, `Không tìm thấy tài khoản nào khớp "${query}".`);
        return;
    }

    const shown = rows.slice(0, MAX_RESULTS);
    const body = shown
        .map((r, i) => `${i + 1}) ${r.project}\nUser: ${r.username}\nPass: ${r.password}\nURL: ${r.url}`)
        .join("\n\n");
    const more = rows.length > shown.length ? `\n\n(Còn ${rows.length - shown.length} kết quả nữa, hãy thu hẹp từ khóa.)` : "";
    await sendZaloMessage(chatId, `Tìm thấy ${rows.length} tài khoản khớp "${query}":\n\n${body}${more}`);
};
