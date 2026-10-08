// Zalo user id -> sheet tab id. Add a line here (and redeploy) when a new member joins.
// Tab ids are used instead of names so renaming a tab in the sheet doesn't break the mapping.
export const USER_TABS: Record<string, number> = {
    f185798b9cc675982cd7: 1535048569, // Kiệt
    "3fc940c0408aa9d4f09b": 0,// Nam
};

// Zalo user ids allowed to look up credentials with /acc.
export const ACCOUNT_VIEWERS: string[] = [
    "f185798b9cc675982cd7", // Kiệt
    "3fc940c0408aa9d4f09b", // Nam
];

export const canViewAccounts = (userId: string): boolean => ACCOUNT_VIEWERS.includes(userId);

export const getTab = (userId: string): number | undefined => USER_TABS[userId];

/** Compare names ignoring case, accents and extra spaces ("Kiệt" == "kiet"). */
export const normalizeName = (s: string): string =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/\s+/g, " ").trim().toLowerCase();
