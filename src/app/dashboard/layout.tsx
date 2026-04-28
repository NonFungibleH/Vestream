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
import { eq } from "drizzle-orm";
import { CurrencyProvider } from "@/lib/use-currency";
import { getRates, getCurrencyFromCookies } from "@/lib/currency";
import { DashboardChrome } from "@/components/DashboardChrome";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Look up the authenticated user's tier without crashing if the request
 * isn't authenticated or the DB is unreachable. Best-effort: returns
 * "free" as a sensible default so the sidebar still renders. Auth
 * gating itself happens at the middleware / per-page level — this is
 * just for the upgrade-prompt rendering.
 */
async function getUserTier(): Promise<string> {
  try {
    const session = await getSession();
    if (!session.address) return "free";
    const [u] = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.address, session.address.toLowerCase()))
      .limit(1);
    return u?.tier ?? "free";
  } catch {
    return "free";
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [rateBundle, cookieStore, tier] = await Promise.all([
    getRates(),
    cookies(),
    getUserTier(),
  ]);
  const initialCurrency = getCurrencyFromCookies(cookieStore);

  return (
    <CurrencyProvider rates={rateBundle.rates} initialCurrency={initialCurrency}>
      <DashboardChrome tier={tier}>{children}</DashboardChrome>
    </CurrencyProvider>
  );
}
