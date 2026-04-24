// src/app/api/mobile/wallets/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
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

  if (!address || !isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Invalid address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
  }

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
  const tokenAddress   = typeof rawToken === "string" && isValidWalletAddress(rawToken) ? normaliseAddress(rawToken) : null;

  // All tiers now support auto-discovery (no token address required).
  // Differentiation is on wallet count + advanced features (alerts, Discover, API), not wallet-add flow.

  const [wallet] = await db.insert(wallets)
    .values({ userId, address: normaliseAddress(address), label, chains: chainFilter, protocols: protocolFilter, tokenAddress })
    .returning();

  return NextResponse.json({ wallet });
}

export async function PATCH(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { address, label, chains, protocols, tokenAddress: rawToken } = body;
  if (!address || !isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Invalid address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
  }

  const user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const chainFilter    = Array.isArray(chains)    && chains.length    > 0 ? chains.map(String)    : null;
  const protocolFilter = Array.isArray(protocols) && protocols.length > 0 ? protocols as string[] : null;
  const tokenAddress   = typeof rawToken === "string" && isValidWalletAddress(rawToken) ? normaliseAddress(rawToken) : null;

  // All tiers now support auto-discovery; no per-tier edit gating.

  const [wallet] = await db.update(wallets)
    .set({ label: label ?? null, chains: chainFilter, protocols: protocolFilter, tokenAddress })
    .where(and(eq(wallets.userId, userId), eq(wallets.address, normaliseAddress(address))))
    .returning();

  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  return NextResponse.json({ wallet });
}

export async function DELETE(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { address } = await req.json().catch(() => ({}));
  if (!address || !isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Invalid address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
  }
  await db.delete(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.address, normaliseAddress(address))));

  return NextResponse.json({ ok: true });
}
