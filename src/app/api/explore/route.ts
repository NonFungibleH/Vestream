import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidWalletAddress } from "@/lib/address-validation";
import { getUserByAddress } from "@/lib/db/queries";
import { explorerFetch } from "@/lib/vesting/explorer";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";

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

    // Server-side tier check — the explorer is Pro-and-above only.
    // `session.address` holds either an email (OTP auth) or 0x wallet (SIWE).
    // getUserByAddress lower-cases and matches on `users.address`, which works
    // for both because upsertUser writes the lowered form on sign-in.
    const user = await getUserByAddress(session.address);
    if (!user || (user.tier !== "pro" && user.tier !== "fund")) {
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
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" } }
    );
  } catch (err) {
    console.error("GET /api/explore error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
