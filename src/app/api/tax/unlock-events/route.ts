// src/app/api/tax/unlock-events/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// The dashboard tax table's data source. Returns one row per unlock tranche,
// each carrying BOTH bases (unlock + claim) so the user can export on whichever
// their jurisdiction requires. Also returns the user's stored basis.
//   GET → { basis, events: TaxEventRow[] }
//
// Auth: dual (web cookie OR mobile Bearer).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getTaxEventsForUser } from "@/lib/vesting/unlock-events";
import { isTaxBasis, DEFAULT_TAX_BASIS, type TaxBasis } from "@/lib/tax/tax-basis";

export const dynamic = "force-dynamic";

async function resolveUserId(req: NextRequest): Promise<string | null> {
  try {
    const session = await getSession();
    if (session.address) {
      const user = await getUserByAddress(session.address);
      if (user) return user.id;
    }
  } catch { /* fall through */ }

  const token = extractBearerToken(req);
  if (token) {
    const userId = await validateMobileToken(token);
    if (userId) return userId;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [[row], events] = await Promise.all([
    db.select({ basis: users.taxBasis }).from(users).where(eq(users.id, userId)).limit(1),
    getTaxEventsForUser(userId),
  ]);

  const basis: TaxBasis = isTaxBasis(row?.basis) ? row.basis : DEFAULT_TAX_BASIS;
  return NextResponse.json({ basis, events });
}
