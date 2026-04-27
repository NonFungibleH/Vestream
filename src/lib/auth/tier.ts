// Server-side helper for reading the authenticated user's billing tier.
//
// Used by paywall surfaces (e.g. /protocols/[slug]/unlocks deep view) to
// decide whether to render full data or the upgrade teaser. Returns:
//   - null  → anonymous visitor (no session)
//   - "free" | "pro" | "fund" → authenticated, tier from `users.tier`
//
// Designed to be cheap (one indexed lookup on users.address) and safe to
// call in any Server Component. Failures (DB unreachable etc.) downgrade
// to null so the page stays renderable; the paywall's default state is
// "show teaser", which is the safe fallback.

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession } from "./session";

export type Tier = "free" | "pro" | "fund";

export async function getCurrentUserTier(): Promise<Tier | null> {
  try {
    const session = await getSession();
    if (!session.address) return null;
    const row = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.address, session.address.toLowerCase()))
      .limit(1);
    const tier = row[0]?.tier;
    if (tier === "pro" || tier === "fund") return tier;
    return "free";
  } catch {
    return null;
  }
}

export function isPaidTier(tier: Tier | null): boolean {
  return tier === "pro" || tier === "fund";
}
