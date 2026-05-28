// Per-token P&L for the web dashboard: entry price + sales + purchases ledgers.
//
// GET    /api/dashboard/pnl/:token  → { entryPrice, sales, purchases }
// POST   /api/dashboard/pnl/:token  → save entry price (upsert), body: { entryPrice }
// DELETE /api/dashboard/pnl/:token  → clear entry price, all sales, all purchases
//
// Auth: iron-session cookie (vestr_session), same as all other dashboard API routes.
// Mirror of /api/mobile/pnl/:token which uses Bearer token auth.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { streamPnl, streamSales, streamPurchases } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function normaliseTokenAddress(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 8 || trimmed.length > 80) return null;
  return trimmed;
}

async function getAuthUserId(): Promise<string | null> {
  const session = await getSession();
  if (!session.address) return null;
  const user = await getUserByAddress(session.address);
  return user?.id ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token: tokenAddressRaw } = await params;
  const tokenAddress = normaliseTokenAddress(tokenAddressRaw);
  if (!tokenAddress) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [entryRow] = await db
    .select({ entryPrice: streamPnl.entryPrice })
    .from(streamPnl)
    .where(and(eq(streamPnl.userId, userId), eq(streamPnl.tokenAddress, tokenAddress)))
    .limit(1);

  const saleRows = await db
    .select({
      id:       streamSales.id,
      saleDate: streamSales.saleDate,
      amount:   streamSales.amount,
      price:    streamSales.price,
    })
    .from(streamSales)
    .where(and(eq(streamSales.userId, userId), eq(streamSales.tokenAddress, tokenAddress)));

  const purchaseRows = await db
    .select({
      id:           streamPurchases.id,
      purchaseDate: streamPurchases.purchaseDate,
      amount:       streamPurchases.amount,
      price:        streamPurchases.price,
    })
    .from(streamPurchases)
    .where(and(eq(streamPurchases.userId, userId), eq(streamPurchases.tokenAddress, tokenAddress)));

  return NextResponse.json({
    entryPrice: entryRow ? Number(entryRow.entryPrice) : null,
    sales: saleRows.map((s) => ({
      id:     s.id,
      date:   s.saleDate,
      amount: Number(s.amount),
      price:  Number(s.price),
    })),
    purchases: purchaseRows.map((p) => ({
      id:     p.id,
      date:   p.purchaseDate,
      amount: Number(p.amount),
      price:  Number(p.price),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token: tokenAddressRaw } = await params;
  const tokenAddress = normaliseTokenAddress(tokenAddressRaw);
  if (!tokenAddress) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const raw = body?.entryPrice;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "Invalid entry price" }, { status: 400 });
  }

  await db
    .insert(streamPnl)
    .values({
      userId,
      tokenAddress,
      entryPrice: String(n),
      updatedAt:  new Date(),
    })
    .onConflictDoUpdate({
      target: [streamPnl.userId, streamPnl.tokenAddress],
      set:    { entryPrice: String(n), updatedAt: new Date() },
    });

  return NextResponse.json({ entryPrice: n });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token: tokenAddressRaw } = await params;
  const tokenAddress = normaliseTokenAddress(tokenAddressRaw);
  if (!tokenAddress) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  await db.delete(streamPnl)
    .where(and(eq(streamPnl.userId, userId), eq(streamPnl.tokenAddress, tokenAddress)));
  await db.delete(streamSales)
    .where(and(eq(streamSales.userId, userId), eq(streamSales.tokenAddress, tokenAddress)));
  await db.delete(streamPurchases)
    .where(and(eq(streamPurchases.userId, userId), eq(streamPurchases.tokenAddress, tokenAddress)));

  return NextResponse.json({ ok: true });
}
