// /api/watchlist
// ─────────────────────────────────────────────────────────────────────────────
// CRUD for the user's token watchlist. Supports:
//   GET  /api/watchlist        → list entries
//   POST /api/watchlist        → add { chainId, tokenAddress, label? }
//   DELETE /api/watchlist?id=… → remove
//
// Auth: iron-session cookie (same as everything else under /dashboard).
// Free tier cap: 5 entries. Pro: unlimited.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { watchlist, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { isValidWalletAddress } from "@/lib/address-validation";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";

const FREE_TIER_LIMIT = 5;

async function getAuthedUserId(): Promise<{ userId: string; tier: string } | null> {
  const session = await getSession();
  if (!session.address) return null;
  const [u] = await db
    .select({ id: users.id, tier: users.tier })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  if (!u) return null;
  return { userId: u.id, tier: u.tier };
}

// ── GET — list entries ──────────────────────────────────────────────────────
export async function GET() {
  const auth = await getAuthedUserId();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await db
    .select()
    .from(watchlist)
    .where(eq(watchlist.userId, auth.userId))
    .orderBy(watchlist.addedAt);

  return NextResponse.json({
    entries: rows.map((r) => ({
      id:            r.id,
      chainId:       r.chainId,
      tokenAddress:  r.tokenAddress,
      label:         r.label,
      weeklyDigest:  r.weeklyDigest,
      perEventPush:  r.perEventPush,
      addedAt:       r.addedAt.toISOString(),
    })),
    limit:     auth.tier === "free" ? FREE_TIER_LIMIT : null,
    tier:      auth.tier,
  });
}

// ── POST — add an entry ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await getAuthedUserId();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Rate-limit per IP — protects against spam adding 10000 entries
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("watchlist:add", ip, 30, "10 m");
  const blocked = rateLimitResponse(rl, "Too many add attempts. Try again in a few minutes.");
  if (blocked) return blocked;

  let body: { chainId?: number | string; tokenAddress?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const chainId = typeof body.chainId === "string" ? Number.parseInt(body.chainId, 10) : body.chainId;
  if (!chainId || !Number.isFinite(chainId) || chainId < 1) {
    return NextResponse.json({ error: "chainId required" }, { status: 400 });
  }

  const tokenAddress = (body.tokenAddress ?? "").trim().toLowerCase();
  if (!isValidWalletAddress(tokenAddress)) {
    return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
  }

  const label = body.label?.trim() || null;

  // Free-tier cap
  if (auth.tier === "free") {
    const [{ count }] = await db
      .select({ count: db.$count(watchlist) })
      .from(watchlist)
      .where(eq(watchlist.userId, auth.userId));
    if (Number(count) >= FREE_TIER_LIMIT) {
      return NextResponse.json(
        {
          error:        "Free tier limit reached",
          message:      `Free accounts can watchlist up to ${FREE_TIER_LIMIT} tokens. Upgrade to Pro for unlimited.`,
          requiredTier: "pro",
        },
        { status: 402 },
      );
    }
  }

  // Insert with conflict-do-nothing semantics — duplicates collapse to a
  // single row thanks to the (userId, chainId, tokenAddress) unique index.
  try {
    const [row] = await db
      .insert(watchlist)
      .values({ userId: auth.userId, chainId, tokenAddress, label })
      .onConflictDoNothing({
        target: [watchlist.userId, watchlist.chainId, watchlist.tokenAddress],
      })
      .returning();

    if (!row) {
      // Already exists — fetch and return so the client still gets a 200.
      const [existing] = await db
        .select()
        .from(watchlist)
        .where(
          and(
            eq(watchlist.userId, auth.userId),
            eq(watchlist.chainId, chainId),
            eq(watchlist.tokenAddress, tokenAddress),
          ),
        )
        .limit(1);
      return NextResponse.json({ entry: existing, alreadyExisted: true });
    }

    return NextResponse.json({ entry: row });
  } catch (err) {
    console.error("[watchlist] insert failed", err);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

// ── DELETE — remove an entry ────────────────────────────────────────────────
// Accepts either:
//   ?id=<uuid>                      — remove by row ID (original behaviour)
//   ?tokenAddress=...&chainId=...   — remove by token+chain (added for WatchButton in Explorer)
export async function DELETE(req: NextRequest) {
  const auth = await getAuthedUserId();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id           = req.nextUrl.searchParams.get("id");
  const tokenAddress = req.nextUrl.searchParams.get("tokenAddress");
  const chainIdRaw   = req.nextUrl.searchParams.get("chainId");

  if (id) {
    await db
      .delete(watchlist)
      .where(and(eq(watchlist.id, id), eq(watchlist.userId, auth.userId)));
    return NextResponse.json({ ok: true });
  }

  if (tokenAddress && chainIdRaw) {
    const chainId = Number.parseInt(chainIdRaw, 10);
    if (!Number.isFinite(chainId)) {
      return NextResponse.json({ error: "Invalid chainId" }, { status: 400 });
    }
    await db
      .delete(watchlist)
      .where(and(
        eq(watchlist.userId, auth.userId),
        eq(watchlist.chainId, chainId),
        eq(watchlist.tokenAddress, tokenAddress.trim().toLowerCase()),
      ));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id or tokenAddress+chainId required" }, { status: 400 });
}
