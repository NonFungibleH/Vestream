// /api/claims/vestings
// ─────────────────────────────────────────────────────────────────────────────
// "Vestings-first" list for the Tax Reports page: one entry per token the
// authenticated user has a tracked vesting in, enriched with their claim
// totals (income). The client (VestingsList) renders these as rows the user
// drills into for per-token claim history + exports.
//
// GET /api/claims/vestings  → { vestings: VestingToken[] }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getUserVestingTokens } from "@/lib/vesting/user-vestings";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session.address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  if (!u) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const vestings = await getUserVestingTokens(u.id);
  return NextResponse.json({ vestings });
}
