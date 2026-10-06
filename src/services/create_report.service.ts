import { appendTasks, listTabs, SheetTabNotFoundError, Tab, TaskEntry } from "./sheet.service";
import { getTab, normalizeName } from "./user_map.service";
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

// Users who ran /report and are expected to send their tasks next (in-memory, lost on restart).
const state = new Map<string, { step: "tasks" }>();

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

/**
 * Find the user's tab from USER_TABS, falling back to matching the Zalo display name against tab names.
 * Undefined if unknown or the tab no longer exists in the sheet.
 */
const resolveTab = (userId: string, userName: string, tabs: Tab[]): Tab | undefined => {
    const saved = getTab(userId);
    const byId = saved !== undefined ? tabs.find((t) => t.id === saved) : undefined;
    return byId ?? tabs.find((t) => normalizeName(t.name) === normalizeName(userName));
};

const unknownTab = (userId: string) =>
    `Mình chưa biết bạn là tab nào trong sheet. Hãy gửi mã này cho admin để được thêm vào: ${userId}`;

export const handleReportMessage = async ({ chatId, userId, userName, text }: IncomingMessage): Promise<void> => {
    const content = text.trim();

    if (/^\/report(@\S+)?$/i.test(content)) {
        if (!resolveTab(userId, userName, await listTabs())) {
            await sendZaloMessage(chatId, unknownTab(userId));
            return;
        }
        state.set(userId, { step: "tasks" });
        await sendZaloMessage(chatId, PROMPT);
        return;
    }

    if (!state.has(userId)) return;

    const tasks = parseTasks(content);
    if (tasks.length === 0) {
        await sendZaloMessage(chatId, `Mình chưa đọc được task nào. Mỗi task cần bắt đầu bằng dấu -, nằm dưới dòng tên dự án.\n\n${PROMPT}`);
        return;
    }

    const tabs = await listTabs();
    const tab = resolveTab(userId, userName, tabs);
    if (!tab) {
        state.delete(userId);
        await sendZaloMessage(chatId, `Tab của bạn không còn trong sheet (có thể đã bị xóa). ${unknownTab(userId)}`);
        return;
    }

    try {
        await appendTasks(tab.id, todayIso(), tasks);
    } catch (err) {
        if (err instanceof SheetTabNotFoundError) {
            state.delete(userId);
            await sendZaloMessage(chatId, "Tab của bạn vừa biến mất khỏi sheet. Báo admin kiểm tra giúp nhé.");
            return;
        }
        throw err;
    }
    state.delete(userId);

    await sendZaloMessage(chatId, `Đã ghi ${tasks.length} task vào tab "${tab.name}":\n${summarize(tasks)}`);
};
