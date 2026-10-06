import { appendTasks, listTabs, SheetTabNotFoundError, Tab, TaskEntry } from "./sheet.service";
import { clearTab, getTab, normalizeName, setTab } from "./user_map.service";
import { sendZaloMessage } from "./zalo.service";

export interface IncomingMessage {
    chatId: string;
    userId: string;
    userName: string;
    text: string;
}

const PROMPT = [
    "Bạn cần báo cáo những task nào hôm nay? Nhóm theo dự án: dòng tên dự án, bên dưới là các task bắt đầu bằng dấu -, số giờ (nếu có) viết cuối dòng.",
    "",
    "Ví dụ:",
    "qnetic",
    "- Build FAQ section 4h",
    "- Fix lỗi đăng nhập",
    "klaviyo",
    "- Extension emails 25p",
].join("\n");

// Where each user is in the conversation (in-memory, lost on restart): picking a tab, or sending tasks.
type ConversationState = { step: "tab"; tabs: Tab[] } | { step: "tasks" };
const state = new Map<string, ConversationState>();

const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // yyyy-mm-dd

const BULLET_RE = /^\s*(?:[-*•+]|\d+[.)])\s+/;
// Trailing hours with a unit: "4h", "1.5h", "1h30", "4 tiếng", "30p", "30 phút", optionally in (parentheses).
const HOURS_RE = /(?:^|\s)\(?(\d+(?:[.,]\d+)?\s*(?:h|giờ|gio|tiếng|tieng)(?:\s*\d{1,2})?|\d+\s*(?:p|m|min|phút|phut))\)?\s*$/i;

/** "4 tiếng" -> "4h", "1 giờ 30" -> "1h30", "30 phút" -> "30p". */
const normalizeHours = (raw: string): string => {
    const hm = raw.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|giờ|gio|tiếng|tieng)(?:\s*(\d{1,2}))?$/i);
    if (hm) return `${hm[1].replace(",", ".")}h${hm[2] ?? ""}`;
    const m = raw.match(/^(\d+)/);
    return `${m![1]}p`;
};

/**
 * Lines without a bullet are project names; bullet lines are tasks of the latest project.
 * Hours may end a task line.
 */
export const parseTasks = (text: string): TaskEntry[] => {
    const seen = new Set<string>();
    const entries: TaskEntry[] = [];
    let project = "";

    for (const line of text.split("\n")) {
        const clean = line.replace(/\s+/g, " ").trim();
        if (!clean) continue;

        if (!BULLET_RE.test(line)) {
            project = clean.replace(/[:：]$/, "").trim();
            continue;
        }

        let task = clean.replace(BULLET_RE, "").trim();
        let hours = "";
        const hm = task.match(HOURS_RE);
        if (hm && task.slice(0, hm.index).trim()) {
            hours = normalizeHours(hm[1]);
            task = task.slice(0, hm.index).trim();
        }
        if (!task) continue;

        const entry: TaskEntry = { task: task.charAt(0).toUpperCase() + task.slice(1), project, hours };
        const key = `${entry.task}|${entry.project}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push(entry);
    }
    return entries;
};

const describe = (e: TaskEntry) => [e.task, e.hours].filter(Boolean).join(" - ");

const summarize = (tasks: TaskEntry[]): string => {
    const byProject = new Map<string, TaskEntry[]>();
    for (const t of tasks) byProject.set(t.project, [...(byProject.get(t.project) ?? []), t]);
    return [...byProject]
        .map(([project, list]) => `${project || "(chưa có dự án)"}\n${list.map((t) => `- ${describe(t)}`).join("\n")}`)
        .join("\n");
};

/** Ask the user which sheet tab is theirs (reply by name or number). */
const askForTab = async (chatId: string, userId: string, tabs: Tab[], intro: string): Promise<void> => {
    state.set(userId, { step: "tab", tabs });
    await sendZaloMessage(chatId, `${intro} Trả lời tên hoặc số thứ tự:\n${tabs.map((t, i) => `${i + 1}. ${t.name}`).join("\n")}`);
};

/**
 * Find the user's current tab. Mappings are stored by tab id, so renaming a tab in the sheet doesn't break them.
 * Falls back to matching the Zalo display name (also upgrades old name-based mappings). Undefined if unknown.
 */
const resolveTab = async (userId: string, userName: string, tabs: Tab[]): Promise<Tab | undefined> => {
    const saved = getTab(userId);
    const byId = typeof saved === "number" ? tabs.find((t) => t.id === saved) : undefined;
    if (byId) return byId;

    const wanted = typeof saved === "string" ? saved : userName;
    const match = tabs.find((t) => normalizeName(t.name) === normalizeName(wanted)) ?? tabs.find((t) => normalizeName(t.name) === normalizeName(userName));
    if (match) setTab(userId, match.id);
    else if (saved !== undefined) clearTab(userId);
    return match;
};

const UNKNOWN_TAB = "Mình chưa biết bạn là tab nào trong sheet.";

export const handleReportMessage = async ({ chatId, userId, userName, text }: IncomingMessage): Promise<void> => {
    const content = text.trim();

    if (/^\/setname(@\S+)?$/i.test(content)) {
        await askForTab(chatId, userId, await listTabs(), "Bạn là tab nào trong sheet?");
        return;
    }

    if (/^\/report(@\S+)?$/i.test(content)) {
        const tabs = await listTabs();
        if (!(await resolveTab(userId, userName, tabs))) {
            await askForTab(chatId, userId, tabs, UNKNOWN_TAB);
            return;
        }
        state.set(userId, { step: "tasks" });
        await sendZaloMessage(chatId, PROMPT);
        return;
    }

    const current = state.get(userId);
    if (!current) return;

    if (current.step === "tab") {
        const index = /^\d+$/.test(content) ? Number(content) - 1 : -1;
        const tab = current.tabs[index] ?? current.tabs.find((t) => normalizeName(t.name) === normalizeName(content));
        if (!tab) {
            await sendZaloMessage(chatId, "Mình không thấy tab đó, bạn trả lời lại đúng tên hoặc số thứ tự trong danh sách nhé.");
            return;
        }
        setTab(userId, tab.id);
        state.set(userId, { step: "tasks" });
        await sendZaloMessage(chatId, `Đã nhớ bạn là tab "${tab.name}" (gõ /setname nếu muốn đổi).\n\n${PROMPT}`);
        return;
    }

    const tasks = parseTasks(content);
    if (tasks.length === 0) {
        await sendZaloMessage(chatId, `Mình chưa đọc được task nào. Mỗi task cần bắt đầu bằng dấu -, nằm dưới dòng tên dự án.\n\n${PROMPT}`);
        return;
    }

    const tabs = await listTabs();
    const tab = await resolveTab(userId, userName, tabs);
    if (!tab) {
        await askForTab(chatId, userId, tabs, "Tab của bạn không còn trong sheet (có thể đã bị xóa). Gõ lại task sau khi chọn tab nhé.");
        return;
    }

    try {
        await appendTasks(tab.id, todayIso(), tasks);
    } catch (err) {
        if (err instanceof SheetTabNotFoundError) {
            clearTab(userId);
            state.delete(userId);
            await sendZaloMessage(chatId, "Tab của bạn vừa biến mất khỏi sheet. Gõ /report để chọn lại tab nhé.");
            return;
        }
        throw err;
    }
    state.delete(userId);

    await sendZaloMessage(chatId, `Đã ghi ${tasks.length} task vào tab "${tab.name}":\n${summarize(tasks)}`);
};
