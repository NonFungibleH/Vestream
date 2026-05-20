// Per-token P&L: entry price + sales ledger.
//
// GET    /api/mobile/pnl/:token         → { entryPrice, sales }
// POST   /api/mobile/pnl/:token         → save entry price (upsert)
// DELETE /api/mobile/pnl/:token         → clear entry price + all sales
//
// Sales add/remove live at /api/mobile/pnl/:token/sales/[sale]/route.ts
// so URL parsing stays simple.
//
// 2026-05-20: introduced for cross-device P&L. Previously this data
// lived only in mobile AsyncStorage / web localStorage, with no sync
// between them. Now both surfaces read/write the same Postgres rows.
//
// `:token` is the lowercased token contract address. The user is
// identified by their bearer token, so the URL doesn't carry any
// PII — the token contract address is public.

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { streamPnl, streamSales } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

function normaliseTokenAddress(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  // Cheap shape check — EVM hex or Solana base58. We don't reject
  // valid-shape strings that aren't actually contracts; storage is
  // user-scoped so the worst case is one unused row per typo.
  if (trimmed.length < 8 || trimmed.length > 80) return null;
  return trimmed;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
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

  return NextResponse.json({
    entryPrice: entryRow ? Number(entryRow.entryPrice) : null,
    sales: saleRows.map((s) => ({
      id:     s.id,
      date:   s.saleDate,
      amount: Number(s.amount),
      price:  Number(s.price),
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token: tokenAddressRaw } = await params;
  const tokenAddress = normaliseTokenAddress(tokenAddressRaw);
  if (!tokenAddress) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const raw  = body?.entryPrice;
  // Accept either number or string (mobile uses parseFloat result;
  // some clients might send strings to preserve precision).
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: "Invalid entry price" }, { status: 400 });
  }

  // Upsert: insert if missing, otherwise update entryPrice + bump
  // updatedAt. Drizzle's onConflictDoUpdate handles this cleanly.
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
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token: tokenAddressRaw } = await params;
  const tokenAddress = normaliseTokenAddress(tokenAddressRaw);
  if (!tokenAddress) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  // Cascade by hand — no FK between the two tables.
  await db.delete(streamPnl)
    .where(and(eq(streamPnl.userId, userId), eq(streamPnl.tokenAddress, tokenAddress)));
  await db.delete(streamSales)
    .where(and(eq(streamSales.userId, userId), eq(streamSales.tokenAddress, tokenAddress)));

  return NextResponse.json({ ok: true });
}
