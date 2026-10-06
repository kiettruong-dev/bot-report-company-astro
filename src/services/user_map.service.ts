import fs from "node:fs";
import path from "node:path";

// Zalo user id -> sheet tab id, persisted across restarts. A tab name string is an older format; callers upgrade it.
// Mappings are kept per Apps Script URL, so pointing the app at a different sheet never reuses another sheet's tab ids.
const FILE = path.resolve(process.cwd(), "data", "user-map.json");

type UserMap = Record<string, number | string>;

const namespace = () => process.env.APPS_SCRIPT_URL ?? "default";

const loadAll = (): Record<string, unknown> => {
    try {
        return JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch {
        return {};
    }
};

const load = (): UserMap => {
    const entry = loadAll()[namespace()];
    return entry && typeof entry === "object" ? (entry as UserMap) : {};
};

const save = (map: UserMap): void => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ ...loadAll(), [namespace()]: map }, null, 2));
};

export const getTab = (userId: string): number | string | undefined => load()[userId];

export const setTab = (userId: string, tab: number): void => {
    save({ ...load(), [userId]: tab });
};

export const clearTab = (userId: string): void => {
    const map = load();
    delete map[userId];
    save(map);
};

/** Compare names ignoring case, accents and extra spaces ("Kiệt" == "kiet"). */
export const normalizeName = (s: string): string =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/\s+/g, " ").trim().toLowerCase();
