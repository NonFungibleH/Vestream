/**
 * GET /api/wallets/scan?address=0x...
 *
 * Pro+ feature: Scans ALL chains × ALL protocols for a wallet address.
 * Returns a summary of discovered vestings grouped by protocol and chain,
 * so the user can see which platforms are actually active for that wallet.
 *
 * This enables "Find Vestings" — useful when a user has forgotten which
 * platforms/chains they used.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { ALL_CHAIN_IDS, CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";

// ─── Per-protocol / chain grouping in the response ────────────────────────────

interface ScanProtocolResult {
  protocolId:   string;
  protocolName: string;
  chainId:      SupportedChainId;
  chainName:    string;
  streamCount:  number;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Pro+ gate — free tier users cannot use Find Vestings
    const user = await getUserByAddress(session.address);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.tier === "free") {
      return NextResponse.json(
        { error: "Pro plan required", code: "UPGRADE_REQUIRED" },
        { status: 402 }
      );
    }

    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    // Scan all chains × all protocols for this wallet
    const streams = await aggregateVestingStreams([address], ALL_CHAIN_IDS);

    // Group by protocol × chain — only keep combos that returned at least one stream
    const byKey = new Map<string, ScanProtocolResult>();
    for (const s of streams) {
      const key = `${s.protocol}:${s.chainId}`;
      if (!byKey.has(key)) {
        const adapter = ADAPTER_REGISTRY.find((a) => a.id === s.protocol);
        byKey.set(key, {
          protocolId:   s.protocol,
          protocolName: adapter?.name ?? s.protocol,
          chainId:      s.chainId,
          chainName:    CHAIN_NAMES[s.chainId] ?? String(s.chainId),
          streamCount:  0,
        });
      }
      byKey.get(key)!.streamCount++;
    }

    const results = [...byKey.values()].sort((a, b) => b.streamCount - a.streamCount);

    // Derive suggested chains + protocols for this wallet
    const suggestedChains    = [...new Set(results.map((r) => r.chainId))];
    const suggestedProtocols = [...new Set(results.map((r) => r.protocolId))];

    return NextResponse.json({
      address: address.toLowerCase(),
      totalStreams: streams.length,
      results,
      suggestedChains,
      suggestedProtocols,
      scannedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /api/wallets/scan error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
