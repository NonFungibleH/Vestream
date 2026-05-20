// DELETE /api/mobile/pnl/:token/sales/:saleId → remove one sale entry.
//
// Scoped by user — a DELETE for a saleId that doesn't belong to the
// authenticated user is a no-op (returns ok). We don't return 404 to
// avoid leaking the existence of other users' sale ids.

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { streamSales } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; saleId: string }> },
) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { saleId } = await params;
  if (!saleId || typeof saleId !== "string") {
    return NextResponse.json({ error: "Invalid sale id" }, { status: 400 });
  }

  await db
    .delete(streamSales)
    .where(and(eq(streamSales.userId, userId), eq(streamSales.id, saleId)));

  return NextResponse.json({ ok: true });
}
