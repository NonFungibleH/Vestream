// src/app/dashboard/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Dashboard-tree layout. Two responsibilities:
//
//   1. Wire the multi-currency provider so every USD-rendering component
//      under /dashboard/* can call useCurrency() + re-render when the user
//      switches currency in /settings.
//
//   2. Render the unified <DashboardChrome> shell — a single shared sidebar
//      that's identical on every dashboard sub-page. Previously, /dashboard,
//      /discover, and /explorer each had their own inline sidebar copies
//      (with subtly different NAV_ITEMS lists), and /watchlist /
//      /income-statement / /exports had no sidebar at all. User reported
//      this as "the menu is inconsistent across pages" — this layout is
//      the fix.
//
// Server-side concerns:
//   - getRates() fetches USD-anchored FX rates (Upstash-cached 1h, falls
//     back to identity rates on provider failure)
//   - getCurrencyFromCookies() reads the user's saved choice for first-byte
//     SSR (avoids hydration flash for non-USD users)
//   - getUserTier() looks up the user's plan tier so the sidebar can render
//     the right upgrade-prompt / "Pro" badge
//
// The chrome is a Client Component (mobile drawer state is client-only);
// this layout is the Server Component that prepares its props.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { CurrencyProvider } from "@/lib/use-currency";
import { DarkModeProvider } from "@/lib/use-dark-mode";
import { getRates, getCurrencyFromCookies } from "@/lib/currency";
import { getDarkModeFromCookies } from "@/lib/dark-mode";
import { DashboardChrome } from "@/components/DashboardChrome";
import { getSession } from "@/lib/auth/session";
import { canAccessDashboard, normaliseTier } from "@/lib/auth/tier";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Server-side dashboard gate. Defense-in-depth on top of the middleware
 * cookie-existence check (src/middleware.ts):
 *
 *   - middleware blocks visitors with NO `vestr_session` cookie.
 *   - this layout DECRYPTS the iron-session and confirms a real address +
 *     Pro tier. A stripped, expired, or non-Pro cookie reaches here, fails
 *     the check, and gets bounced — the middleware can't do this because it
 *     can't decrypt the cookie at the edge.
 *
 * Build-phase guard: skip DB/session work during `next build` (no request
 * context) so static generation doesn't crash — see CLAUDE.md landmine.
 * Returns the validated tier for the sidebar's upgrade-prompt rendering.
 */
async function requireDashboardAccess(): Promise<string> {
  if (process.env.NEXT_PHASE === "phase-production-build") return "pro";
  let address: string | null = null;
  try {
    const session = await getSession();
    address = session.address ?? null;
  } catch {
    address = null;
  }
  // No valid (decryptable) session → not logged in.
  if (!address) redirect("/login");

  let tier = "free";
  try {
    const [u] = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.address, address.toLowerCase()))
      .limit(1);
    tier = u?.tier ?? "free";
  } catch {
    // DB unreachable — fail CLOSED for a security gate. A transient blip
    // bouncing a real Pro user to /login is recoverable; serving the
    // dashboard to an unverified session is not.
    redirect("/login");
  }

  if (!canAccessDashboard(normaliseTier(tier))) {
    // Valid session but not Pro (e.g. lapsed subscription) → upgrade path.
    redirect("/login");
  }
  return tier;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate FIRST — redirect() throws, so nothing below renders for an
  // unauthenticated / non-Pro request.
  const tier = await requireDashboardAccess();

  const [rateBundle, cookieStore] = await Promise.all([
    getRates(),
    cookies(),
  ]);
  const initialCurrency = getCurrencyFromCookies(cookieStore);
  // SSR-read the night-mode cookie and hand it to DarkModeProvider, which
  // owns the single `.dark` wrapper for the whole dashboard tree and exposes
  // { dark, toggle } to client components. This is the single source of truth
  // — pages no longer keep their own dark state, and there's one toggle
  // (the sidebar). First-byte correct (no flash), reactive on toggle.
  const dark = getDarkModeFromCookies(cookieStore);

  return (
    <CurrencyProvider rates={rateBundle.rates} initialCurrency={initialCurrency}>
      <DarkModeProvider initialDark={dark}>
        <DashboardChrome tier={tier}>{children}</DashboardChrome>
      </DarkModeProvider>
    </CurrencyProvider>
  );
}
