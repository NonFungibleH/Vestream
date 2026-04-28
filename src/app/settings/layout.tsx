// src/app/settings/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Settings is logically a dashboard surface — users navigate to it from
// the dashboard sidebar — but the route lives at /settings (not
// /dashboard/settings) for historical / bookmark-stability reasons. We
// preserve the URL but mount the SAME layout chrome so the left-rail nav
// stays consistent with every other dashboard sub-route.
//
// Mirrors src/app/dashboard/layout.tsx exactly (currency provider + chrome
// + tier lookup). If the dashboard layout grows new responsibilities,
// add them here too. Kept duplicated rather than extracted into a shared
// helper because the duplication is narrow and the indirection cost
// (Server Component composition rules) outweighs it.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { CurrencyProvider } from "@/lib/use-currency";
import { getRates, getCurrencyFromCookies } from "@/lib/currency";
import { DashboardChrome } from "@/components/DashboardChrome";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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

export default async function SettingsLayout({
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
