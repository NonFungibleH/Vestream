// DELETE /api/dashboard/pnl/:token/purchases/:purchaseId  → remove a single purchase row
//
// Auth: iron-session cookie (vestr_session).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { streamPurchases } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session.address) return null;
  const user = await getUserByAddress(session.address);
  return user?.id ?? null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; purchaseId: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { purchaseId } = await params;
  if (!purchaseId) return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });

  const result = await db
    .delete(streamPurchases)
    .where(and(eq(streamPurchases.id, purchaseId), eq(streamPurchases.userId, userId)))
    .returning({ id: streamPurchases.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
