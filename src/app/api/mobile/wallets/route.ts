// src/app/api/mobile/wallets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(wallets).where(eq(wallets.userId, userId));
  return NextResponse.json({ wallets: rows });
}

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { address, label } = await req.json().catch(() => ({}));
  if (!address) return NextResponse.json({ error: "Address required" }, { status: 400 });

  const [wallet] = await db.insert(wallets)
    .values({ userId, address: address.toLowerCase(), label })
    .returning();

  return NextResponse.json({ wallet });
}

export async function DELETE(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { address } = await req.json().catch(() => ({}));
  await db.delete(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.address, address.toLowerCase())));

  return NextResponse.json({ ok: true });
}
