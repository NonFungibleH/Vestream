// src/app/api/mobile/wallets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { wallets } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const WALLET_LIMITS: Record<string, number | null> = {
  free: 1,
  pro:  3,
  fund: null,
};

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

  const body = await req.json().catch(() => ({}));
  const { address, label, chains, protocols, tokenAddress: rawToken } = body;

  if (!address) return NextResponse.json({ error: "Address required" }, { status: 400 });

  const user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Enforce wallet limit
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId));
  const limit = WALLET_LIMITS[user.tier] ?? null;
  if (limit !== null && existing.length >= limit) {
    return NextResponse.json(
      { error: `${user.tier === "free" ? "Free" : "Pro"} plan limit reached. Upgrade to add more wallets.`, code: "WALLET_LIMIT_REACHED" },
      { status: 402 }
    );
  }

  // null = scan everything; non-null = restrict to listed IDs
  const chainFilter    = Array.isArray(chains)    && chains.length    > 0 ? chains.map(String)    : null;
  const protocolFilter = Array.isArray(protocols) && protocols.length > 0 ? protocols as string[] : null;
  const tokenAddress   = typeof rawToken === "string" && isAddress(rawToken) ? rawToken.toLowerCase() : null;

  // Free plan: token address, chain, and protocol are all required.
  // Auto-discovery is a Pro+ feature.
  if (user.tier === "free") {
    if (!tokenAddress) {
      return NextResponse.json(
        { error: "Free plan requires a token contract address. Upgrade to Pro to auto-scan.", code: "TOKEN_ADDRESS_REQUIRED" },
        { status: 402 }
      );
    }
    if (!chainFilter || chainFilter.length === 0) {
      return NextResponse.json({ error: "Free plan: select a chain.", code: "CHAIN_REQUIRED" }, { status: 400 });
    }
    if (!protocolFilter || protocolFilter.length === 0) {
      return NextResponse.json({ error: "Free plan: select a vesting platform.", code: "PROTOCOL_REQUIRED" }, { status: 400 });
    }
  }

  const [wallet] = await db.insert(wallets)
    .values({ userId, address: address.toLowerCase(), label, chains: chainFilter, protocols: protocolFilter, tokenAddress })
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
