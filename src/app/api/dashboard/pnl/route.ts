// GET /api/dashboard/pnl  → all P&L data for the authenticated user
//
// Returns all entry prices, sales, and purchases in one round-trip so the
// web dashboard can hydrate the PnLPanel in a single fetch on mount.
// Per-token mutations live at /api/dashboard/pnl/[token]/* routes.
//
// Auth: iron-session cookie (vestr_session).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { streamPnl, streamSales, streamPurchases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session.address) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserByAddress(session.address);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const [entryRows, saleRows, purchaseRows] = await Promise.all([
    db.select({
      tokenAddress: streamPnl.tokenAddress,
      entryPrice:   streamPnl.entryPrice,
    }).from(streamPnl).where(eq(streamPnl.userId, userId)),

    db.select({
      id:           streamSales.id,
      tokenAddress: streamSales.tokenAddress,
      saleDate:     streamSales.saleDate,
      amount:       streamSales.amount,
      price:        streamSales.price,
    }).from(streamSales).where(eq(streamSales.userId, userId)),

    db.select({
      id:           streamPurchases.id,
      tokenAddress: streamPurchases.tokenAddress,
      purchaseDate: streamPurchases.purchaseDate,
      amount:       streamPurchases.amount,
      price:        streamPurchases.price,
    }).from(streamPurchases).where(eq(streamPurchases.userId, userId)),
  ]);

  // Reshape into { [tokenAddress]: { entryPrice, sales, purchases } }
  const byToken: Record<string, {
    entryPrice: number | null;
    sales: { id: string; date: string; amount: number; price: number }[];
    purchases: { id: string; date: string; amount: number; price: number }[];
  }> = {};

  for (const r of entryRows) {
    byToken[r.tokenAddress] ??= { entryPrice: null, sales: [], purchases: [] };
    byToken[r.tokenAddress].entryPrice = Number(r.entryPrice);
  }
  for (const r of saleRows) {
    byToken[r.tokenAddress] ??= { entryPrice: null, sales: [], purchases: [] };
    byToken[r.tokenAddress].sales.push({
      id:     r.id,
      date:   r.saleDate,
      amount: Number(r.amount),
      price:  Number(r.price),
    });
  }
  for (const r of purchaseRows) {
    byToken[r.tokenAddress] ??= { entryPrice: null, sales: [], purchases: [] };
    byToken[r.tokenAddress].purchases.push({
      id:     r.id,
      date:   r.purchaseDate,
      amount: Number(r.amount),
      price:  Number(r.price),
    });
  }

  return NextResponse.json({ byToken });
}
