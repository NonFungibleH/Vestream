// POST /api/dashboard/pnl/:token/sales  → add a sale transaction, returns row
//
// Auth: iron-session cookie (vestr_session).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { streamSales } from "@/lib/db/schema";

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
  const date   = typeof body?.date   === "string" ? body.date.trim() : "";
  const amount = Number(body?.amount);
  const price  = Number(body?.price);

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
      saleDate: date,
      amount:   String(amount),
      price:    String(price),
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
