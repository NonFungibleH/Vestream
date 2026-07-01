// src/app/settings/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Settings is logically a dashboard surface – users navigate to it from
// the dashboard sidebar – but the route lives at /settings (not
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
import { DarkModeProvider } from "@/lib/use-dark-mode";
import { getRates, getCurrencyFromCookies } from "@/lib/currency";
import { getDarkModeFromCookies } from "@/lib/dark-mode";
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
  // Mirror the dashboard layout's dark-mode application – see comment there.
  const dark = getDarkModeFromCookies(cookieStore);

  // DarkModeProvider – same as src/app/dashboard/layout.tsx. Mounting it
  // here is what makes the sidebar's night-mode toggle actually work on
  // /settings: useDarkMode() needs the provider in its tree, otherwise it
  // returns a no-op `toggle` and the SSR `<div className="dark">` below
  // never refreshes (the user's click does nothing).
  //
  // The provider's own wrapper `<div className={dark ? "dark" : ""}>` is the
  // single reactive theming hook for the whole subtree, so we DON'T add a
  // separate SSR-only wrapper here – that would create a non-reactive
  // ancestor that stays dark through the brief window after a toggle.
  return (
    <CurrencyProvider rates={rateBundle.rates} initialCurrency={initialCurrency}>
      <DarkModeProvider initialDark={dark}>
        <DashboardChrome tier={tier}>{children}</DashboardChrome>
      </DarkModeProvider>
    </CurrencyProvider>
  );
}
