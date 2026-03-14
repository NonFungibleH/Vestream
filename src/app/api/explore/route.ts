import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { explorerFetch } from "@/lib/vesting/explorer";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";

/**
 * GET /api/explore?token=0x...&chainId=1
 *
 * Returns all vesting streams for the given token across Sablier and UNCX.
 * Requires auth. Pro+ gate is enforced client-side on the explorer page.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const token   = searchParams.get("token");
    const chainId = Number(searchParams.get("chainId") ?? "1");

    if (!token || !isAddress(token)) {
      return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
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
