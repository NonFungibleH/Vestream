// src/app/api/mobile/watchlist/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Watchlist CRUD (list + add) for the mobile app. The watchlist lets a user
// follow ANY token's unlock schedule WITHOUT owning a wallet that holds it —
// see the `watchlist` table doc in schema.ts. Per-entry alert toggles
// (weeklyDigest / perEventPush) live on the row; the aggregate unlock data
// is fetched lazily per token via /api/mobile/explore.
//
// Auth + tier-limit pattern mirrors /api/mobile/wallets exactly. 2026-06-11.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { db } from "@/lib/db";
import { watchlist } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";

// Watchlist caps per tier. null = unlimited.
//   free   → 5   (the table doc's stated free allowance)
//   mobile → ∞   legacy tier alias, treated as Pro
//   pro    → ∞
const WATCHLIST_LIMITS: Record<string, number | null> = {
  free:   5,
  mobile: null,
  pro:    null,
};

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.select().from(watchlist).where(eq(watchlist.userId, userId));
  // Newest first so a freshly-added token lands at the top of the list.
  rows.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  return NextResponse.json({ watchlist: rows });
}

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { tokenAddress: rawToken, chainId: rawChain, label } = body;

  if (!rawToken || !isValidWalletAddress(rawToken)) {
    return NextResponse.json({ error: "Invalid token address — expected EVM 0x… or Solana SPL mint" }, { status: 400 });
  }
  const chainId = Number(rawChain);
  if (!ALL_CHAIN_IDS.includes(chainId as SupportedChainId)) {
    return NextResponse.json({ error: "Unsupported chainId" }, { status: 400 });
  }
  const tokenAddress = normaliseAddress(rawToken);

  const user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Already watching? The DB has a unique (userId, chainId, tokenAddress)
  // index; pre-check so we return a clean 409 instead of a raw PG error.
  const [dup] = await db.select().from(watchlist).where(and(
    eq(watchlist.userId, userId),
    eq(watchlist.chainId, chainId),
    eq(watchlist.tokenAddress, tokenAddress),
  )).limit(1);
  if (dup) {
    return NextResponse.json(
      { error: "Already watching this token", code: "ALREADY_WATCHING", entry: dup },
      { status: 409 },
    );
  }

  // Enforce the per-tier cap (null = unlimited).
  const limit = WATCHLIST_LIMITS[user.tier] ?? 5;
  if (limit != null) {
    const existing = await db.select().from(watchlist).where(eq(watchlist.userId, userId));
    if (existing.length >= limit) {
      return NextResponse.json(
        {
          error: `Free plan watches up to ${limit} tokens. Upgrade to Pro for unlimited.`,
          code:  "WATCHLIST_LIMIT_REACHED",
          limit,
          tier:  user.tier,
        },
        { status: 402 },
      );
    }
  }

  const [entry] = await db.insert(watchlist)
    .values({
      userId,
      chainId,
      tokenAddress,
      label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : null,
    })
    .returning();

  return NextResponse.json({ entry });
}
