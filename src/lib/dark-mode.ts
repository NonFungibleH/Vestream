// src/lib/dark-mode.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared dark-mode persistence for the dashboard surfaces.
//
// Why this file exists: the dashboard (/dashboard) and discover page
// (/dashboard/discover) had their own client-side localStorage handlers.
// The explorer (/dashboard/explorer) is a server component, so it had no
// way to know the user's preference and always rendered light. Symptom:
// flip dark mode on the dashboard, click into Explorer → page goes back
// to light mode.
//
// Fix: store the preference in BOTH localStorage AND a cookie. Server
// components read the cookie via `cookies()`; client components keep the
// localStorage path for instant client-side reads. They stay in sync via
// the toggle helper in this file.
//
// Cookie semantics:
//   - Name: `vestr-dark`
//   - Value: `"1"` for dark, `"0"` (or absent) for light
//   - Path: `/` so all dashboard sub-routes see it
//   - Max-Age: 365 days
//   - SameSite: Lax (no cross-site concerns; this is a UI preference)
//   - NOT httpOnly — the client toggle writes it directly via document.cookie
// ─────────────────────────────────────────────────────────────────────────────

export const DARK_MODE_KEY    = "vestr-dark";
export const DARK_MODE_COOKIE = "vestr-dark";
const COOKIE_MAX_AGE_SECONDS  = 60 * 60 * 24 * 365;

/**
 * Server-side: read the dark-mode cookie. Returns true if the user has
 * opted into dark mode on a previous visit (or another dashboard surface).
 *
 * Pass the result of `await cookies()` (Next.js 15 API).
 */
export function getDarkModeFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined },
): boolean {
  return cookieStore.get(DARK_MODE_COOKIE)?.value === "1";
}

/**
 * Client-side: persist a dark-mode preference. Writes to BOTH localStorage
 * and a cookie so future server-rendered routes see it on first byte.
 *
 * No-op when called server-side (`window` undefined) — safe to call from
 * effects or event handlers without a `typeof window` guard.
 */
export function setDarkModePreference(dark: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DARK_MODE_KEY, dark ? "1" : "0");
  } catch { /* localStorage disabled — fall through to cookie */ }
  try {
    document.cookie = `${DARK_MODE_COOKIE}=${dark ? "1" : "0"}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch { /* doc not yet available — caller should retry on next event */ }
}

/**
 * Client-side: hydrate the initial dark-mode preference from storage.
 * Prefers localStorage (no parse cost) but falls back to the cookie if
 * localStorage is empty (cross-surface case: cookie set on dashboard,
 * client mounting on a fresh tab where localStorage is unset).
 */
export function getDarkModePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage.getItem(DARK_MODE_KEY);
    if (ls === "1") return true;
    if (ls === "0") return false;
  } catch { /* fall through to cookie */ }
  try {
    return document.cookie.split("; ").some((c) => c === `${DARK_MODE_COOKIE}=1`);
  } catch {
    return false;
  }
}
