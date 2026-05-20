// Sales-ledger CRUD for a given token.
//
// POST   /api/mobile/pnl/:token/sales       → add a sale, returns row
//
// Individual-sale deletion lives at .../sales/[saleId]/route.ts so the
// URL hierarchy stays restful.
//
// 2026-05-20: companion to /api/mobile/pnl/:token. Sales is a 1:N
// table so adds don't touch the entry-price row.

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { streamSales } from "@/lib/db/schema";

function normaliseTokenAddress(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length < 8 || trimmed.length > 80) return null;
  return trimmed;
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
  const date   = typeof body?.date   === "string" ? body.date.trim() : "";
  const amount = Number(body?.amount);
  const price  = Number(body?.price);

  // Cheap validation. Date is stored as the client's chosen format
  // (ISO recommended); we just enforce non-empty + bounded length.
  if (!date || date.length > 30) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 });
  }

  const [row] = await db
    .insert(streamSales)
    .values({
      userId,
      tokenAddress,
      saleDate:  date,
      amount:    String(amount),
      price:     String(price),
    })
    .returning({
      id:       streamSales.id,
      saleDate: streamSales.saleDate,
      amount:   streamSales.amount,
      price:    streamSales.price,
    });

  return NextResponse.json({
    sale: {
      id:     row.id,
      date:   row.saleDate,
      amount: Number(row.amount),
      price:  Number(row.price),
    },
  });
}
