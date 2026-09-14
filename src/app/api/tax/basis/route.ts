// src/app/api/tax/basis/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read / set the user's tax basis for vesting income.
//   GET → { basis: "claim" | "unlock" }
//   PUT → body { basis }; validates via isTaxBasis; updates users.tax_basis
//
// Auth: same dual-auth pattern as the stream tags/annotation endpoints
// (web iron-session cookie OR mobile Bearer token).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
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

  const [row] = await db
    .select({ basis: users.taxBasis })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const basis: TaxBasis = isTaxBasis(row?.basis) ? row.basis : DEFAULT_TAX_BASIS;
  return NextResponse.json({ basis });
}

export async function PUT(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const basis = (body as { basis?: unknown })?.basis;
  if (!isTaxBasis(basis)) {
    return NextResponse.json({ error: "basis must be 'claim' or 'unlock'" }, { status: 400 });
  }

  await db.update(users).set({ taxBasis: basis }).where(eq(users.id, userId));
  return NextResponse.json({ basis });
}
