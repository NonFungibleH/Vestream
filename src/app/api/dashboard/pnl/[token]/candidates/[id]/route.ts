// POST /api/dashboard/pnl/:token/candidates/:id  body: { action: "confirm" | "dismiss" }
// ─────────────────────────────────────────────────────────────────────────────
// Act on an auto-detected disposal candidate.
//   confirm → insert a stream_sales row (source="detected") + mark confirmed.
//   dismiss → mark dismissed (kept so future scans skip it).
// Auth: iron-session (vestr_session), scoped to the requesting user.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { disposalCandidates, streamSales } from "@/lib/db/schema";
import { baseToWhole } from "@/lib/vesting/sell-detect";

export const runtime = "nodejs";

async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session.address) return null;
  const user = await getUserByAddress(session.address);
  return user?.id ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "confirm" && action !== "dismiss") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const [cand] = await db
    .select()
    .from(disposalCandidates)
    .where(and(eq(disposalCandidates.id, id), eq(disposalCandidates.userId, userId)))
    .limit(1);
  if (!cand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "dismiss") {
    await db.update(disposalCandidates).set({ status: "dismissed" }).where(eq(disposalCandidates.id, id));
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  // confirm → copy into the gains ledger, then mark confirmed.
  if (cand.status !== "confirmed") {
    await db.insert(streamSales).values({
      userId,
      tokenAddress: cand.tokenAddress,
      saleDate:     cand.occurredAt.toISOString().slice(0, 10),
      amount:       baseToWhole(cand.amountRaw, cand.decimals),
      price:        cand.priceUsdAtTime ?? "0",
      source:       "detected",
    });
    await db.update(disposalCandidates).set({ status: "confirmed" }).where(eq(disposalCandidates.id, id));
  }
  return NextResponse.json({ ok: true, status: "confirmed" });
}
