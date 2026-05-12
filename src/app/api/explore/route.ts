import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidWalletAddress } from "@/lib/address-validation";
import { getUserByAddress } from "@/lib/db/queries";
import { canAccessDashboard, normaliseTier } from "@/lib/auth/tier";
import { explorerFetch } from "@/lib/vesting/explorer";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

/**
 * GET /api/explore?token=0x...&chainId=1
 *
 * Returns all vesting streams for the given token across Sablier and UNCX.
 * Requires auth AND Pro+ tier — the explorer is a paid feature. The client
 * page also gates access, but defence-in-depth: a logged-in Free user hitting
 * this API directly used to get the full explorer payload for free.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate-limit per-session: 30/min. A logged-in Pro user can otherwise
    // hammer the explorer endpoint to drain our subgraph credits — costs
    // us, not them. Keyed off the session address so two users sharing
    // a coffee-shop IP don't collide.
    const rl = await checkRateLimit("explore", session.address, 30, "1 m");
    const blocked = rateLimitResponse(rl, "Too many explorer requests. Try again in a minute.");
    if (blocked) return blocked;

    // Server-side tier check — the explorer is Pro only (mobile tier
    // doesn't have web dashboard access). canAccessDashboard centralises
    // the rule so future tier reshuffles only touch one helper.
    const user = await getUserByAddress(session.address);
    if (!user || !canAccessDashboard(normaliseTier(user.tier))) {
      return NextResponse.json(
        { error: "Pro plan required", upgradeUrl: "/pricing" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const token   = searchParams.get("token");
    const chainId = Number(searchParams.get("chainId") ?? "1");

    if (!token || !isValidWalletAddress(token)) {
      return NextResponse.json({ error: "Invalid token address — expected EVM 0x… or Solana SPL mint" }, { status: 400 });
    }
    if (!ALL_CHAIN_IDS.includes(chainId as SupportedChainId)) {
      return NextResponse.json({ error: "Unsupported chainId" }, { status: 400 });
    }

    const streams = await explorerFetch(token, chainId as SupportedChainId);

    return NextResponse.json(
      { streams, fetchedAt: new Date().toISOString() },
      // 15-min edge cache (was 2 min). Bumped 2026-05-10 — egress reduction.
      { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("GET /api/explore error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
