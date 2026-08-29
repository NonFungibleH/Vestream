export declare const DARK_MODE_KEY = "vestr-dark";
export declare const DARK_MODE_COOKIE = "vestr-dark";
/**
 * Server-side: read the dark-mode cookie. Returns true if the user has
 * opted into dark mode on a previous visit (or another dashboard surface).
 *
 * Pass the result of `await cookies()` (Next.js 15 API).
 */
export declare function getDarkModeFromCookies(cookieStore: {
    get: (name: string) => {
        value: string;
    } | undefined;
}): boolean;
/**
 * Client-side: persist a dark-mode preference. Writes to BOTH localStorage
 * and a cookie so future server-rendered routes see it on first byte.
 *
 * No-op when called server-side (`window` undefined) — safe to call from
 * effects or event handlers without a `typeof window` guard.
 */
export declare function setDarkModePreference(dark: boolean): void;
/**
 * Client-side: hydrate the initial dark-mode preference from storage.
 * Prefers localStorage (no parse cost) but falls back to the cookie if
 * localStorage is empty (cross-surface case: cookie set on dashboard,
 * client mounting on a fresh tab where localStorage is unset).
 */
export declare function getDarkModePreference(): boolean;
