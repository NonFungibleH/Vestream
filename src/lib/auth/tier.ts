// Server-side helper for reading the authenticated user's billing tier.
//
// Used by paywall surfaces (dashboard pages, explorer, saved searches) to
// decide whether to render full data or an upgrade teaser. Returns:
//   - null  → anonymous visitor (no session)
//   - "free" | "mobile" | "pro" → authenticated, tier from `users.tier`
//
// Tier scheme (May 2026 — replaced legacy "free" | "pro" | "fund"):
//
//   free   — $0       — website search (find-vestings) + 1 wallet + a few alerts
//   mobile — $9.99/mo — mobile app, push alerts, email alerts, multi-wallet
//   pro    — $14.99/mo — mobile + web dashboard + tax exports + Discover
//
// The web dashboard is gated to "pro" only. Desktop login is via QR code
// pairing from the mobile app — see /api/auth/desktop-pair/* routes.
//
// Designed to be cheap (one indexed lookup on users.address) and safe to
// call in any Server Component. Failures (DB unreachable etc.) downgrade
// to null so the page stays renderable; the paywall's default state is
// "show teaser", which is the safe fallback.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession } from "./session";

export type Tier = "free" | "mobile" | "pro";

export async function getCurrentUserTier(): Promise<Tier | null> {
  try {
    const session = await getSession();
    if (!session.address) return null;
    const row = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.address, session.address.toLowerCase()))
      .limit(1);
    return normaliseTier(row[0]?.tier);
  } catch {
    return null;
  }
}

/**
 * Coerce an unknown DB value into the canonical Tier union. Anything we
 * don't recognise (legacy "fund" rows, NULLs, garbage) downgrades to
 * "free" so callers never have to handle the unknown case.
 */
export function normaliseTier(raw: string | null | undefined): Tier {
  if (raw === "pro")    return "pro";
  if (raw === "mobile") return "mobile";
  return "free";
}

/** Any paid tier — mobile OR pro. Used for "is this user paying us?". */
export function isPaidTier(tier: Tier | null): boolean {
  return tier === "mobile" || tier === "pro";
}

/**
 * Web dashboard / Discover / saved-searches gate — pro only.
 * Mobile-tier users have the app but not the desktop surface.
 */
export function canAccessDashboard(tier: Tier | null): boolean {
  return tier === "pro";
}
