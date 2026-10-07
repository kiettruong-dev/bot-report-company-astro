import axios from "axios";

export interface TaskEntry {
    task: string;
    project: string;
    /** Free text such as "4h" or "25p"; empty when not provided. */
    hours: string;
}

export class SheetTabNotFoundError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Apps Script sometimes answers with a Google HTML error page (cold start / overload)
 * instead of JSON. `retries` is only safe for read-only calls.
 */
const callScript = async (payload: Record<string, unknown>, retries = 0): Promise<any> => {
    const url = process.env.APPS_SCRIPT_URL;
    if (!url) throw new Error("Missing APPS_SCRIPT_URL");

    // Apps Script answers 200 with {ok:false,...} on failure, so check the body too.
    const { data } = await axios.post(
        url,
        { secret: process.env.APPS_SCRIPT_SECRET, ...payload },
        { headers: { "Content-Type": "text/plain" }, timeout: 60000 },
    );
    if (data?.ok) return data;
    if (retries > 0 && typeof data === "string") {
        await sleep(1000);
        return callScript(payload, retries - 1);
    }
    if (data?.error === "tab_not_found") throw new SheetTabNotFoundError(String(payload.tabId));
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Apps Script error: ${data?.error ?? `unknown response: ${String(raw).slice(0, 300)}`}`);
};

export interface Tab {
    /** Stable sheet id (gid); does not change when the tab is renamed. */
    id: number;
    name: string;
}

/** All tabs in the spreadsheet. */
export const listTabs = async (): Promise<Tab[]> => {
    const { tabs } = await callScript({ action: "tabs" }, 2);
    if (!Array.isArray(tabs) || tabs.some((t) => typeof t?.name !== "string" || typeof t?.id !== "number")) {
        throw new Error("Apps Script returned tabs in an old format: redeploy Code.gs as a new version");
    }
    return tabs;
};

/** Append tasks to the existing tab with id `tabId`. `date` is yyyy-mm-dd. */
export const appendTasks = async (tabId: number, date: string, tasks: TaskEntry[]): Promise<void> => {
    await callScript({ tabId, date, tasks });
};
