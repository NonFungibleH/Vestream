// DELETE /api/dashboard/pnl/:token/sales/:saleId  → remove a single sale row
//
// Auth: iron-session cookie (vestr_session).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { streamSales } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session.address) return null;
  const user = await getUserByAddress(session.address);
  return user?.id ?? null;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; saleId: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { saleId } = await params;
  if (!saleId) return NextResponse.json({ error: "Missing saleId" }, { status: 400 });

  // Delete only if this sale belongs to the authenticated user (no userId filter
  // leaks data — the userId in the row must match the session user).
  const result = await db
    .delete(streamSales)
    .where(and(eq(streamSales.id, saleId), eq(streamSales.userId, userId)))
    .returning({ id: streamSales.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
