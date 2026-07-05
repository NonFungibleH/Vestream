// src/app/api/tax/unlock-events/[id]/price/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manual fair-market-value override for a single unlock event. Used when the
// token had no historical price at unlock (pre-liquid tokens are common: they
// unlock before listing). The user enters an FMV; we persist it and flag the
// row "manual" so pricing passes never overwrite it.
//   PUT → body { usd: number }; sets usdValueAtUnlock + priceConfidence="manual"
//
// Guards (in setManualUnlockPrice): row must belong to the user AND still be
// "missing" (never overwrite an auto-priced or already-manual row).
// Auth: dual (web cookie OR mobile Bearer).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { getUserByAddress } from "@/lib/db/queries";
import { setManualUnlockPrice } from "@/lib/vesting/unlock-events";

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const usd = (body as { usd?: unknown })?.usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
    return NextResponse.json({ error: "usd must be a positive number" }, { status: 400 });
  }

  const updated = await setManualUnlockPrice(userId, id, usd);
  if (!updated) {
    // Not found, not the user's, or already priced (not "missing").
    return NextResponse.json({ error: "Event not found or already priced" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, usdValueAtUnlock: usd.toFixed(6), priceConfidence: "manual" });
}
