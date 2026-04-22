// src/app/api/find-vestings/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public wallet scan endpoint used by the /find-vestings page.
//
//   - Unauthenticated — designed to funnel users into the mobile app
//   - Rate-limited (5 scans per IP per hour, 20 per day)
//   - Mainnet chains only (no testnets)
//   - Returns a lightweight per-protocol×chain summary, not raw streams
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { CHAIN_IDS, CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";
import { checkRateLimit } from "@/lib/ratelimit";

// Only scan mainnets — testnets would pollute results
const MAINNET_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
];

export interface FindVestingsTokenSummary {
  symbol:          string;
  address:         string;
  decimals:        number;
  streamCount:     number;
  totalAmountRaw:  string;
  claimableNowRaw: string;
  lockedAmountRaw: string;
}

export interface FindVestingsGroup {
  protocolId:   string;
  protocolName: string;
  chainId:      number;
  chainName:    string;
  streamCount:  number;
  tokens:       FindVestingsTokenSummary[];
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(req: NextRequest) {
  const ip = getIp(req);

  // Two-tier rate limit: 5/hour burst + 20/day sustained
  const burst = await checkRateLimit("find-vestings-burst", ip, 5, "1 h");
  if (!burst.allowed) {
    return NextResponse.json(
      { error: "Rate limit: 5 scans per hour. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((burst.reset - Date.now()) / 1000)) } }
    );
  }
  const daily = await checkRateLimit("find-vestings-daily", ip, 20, "1 d");
  if (!daily.allowed) {
    return NextResponse.json(
      { error: "Rate limit: 20 scans per day. Sign up for the app to remove the limit." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((daily.reset - Date.now()) / 1000)) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const streams = await aggregateVestingStreams([address.toLowerCase()], MAINNET_CHAINS);

    // Group by protocol × chain, then per-token
    const byKey = new Map<string, { group: FindVestingsGroup; tokenMap: Map<string, FindVestingsTokenSummary> }>();

    for (const s of streams) {
      // Merge uncx-vm into uncx for user-facing grouping
      const protocolId = s.protocol === "uncx-vm" ? "uncx" : s.protocol;
      const key = `${protocolId}:${s.chainId}`;

      if (!byKey.has(key)) {
        const adapter = ADAPTER_REGISTRY.find((a) => a.id === protocolId);
        byKey.set(key, {
          group: {
            protocolId,
            protocolName: adapter?.name ?? protocolId,
            chainId:      s.chainId as number,
            chainName:    CHAIN_NAMES[s.chainId as SupportedChainId] ?? String(s.chainId),
            streamCount:  0,
            tokens:       [],
          },
          tokenMap: new Map(),
        });
      }

      const { group, tokenMap } = byKey.get(key)!;
      group.streamCount++;

      const tokenKey = (s.tokenAddress ?? s.tokenSymbol).toLowerCase();
      if (!tokenMap.has(tokenKey)) {
        tokenMap.set(tokenKey, {
          symbol:          s.tokenSymbol,
          address:         s.tokenAddress ?? "",
          decimals:        s.tokenDecimals ?? 18,
          streamCount:     0,
          totalAmountRaw:  "0",
          claimableNowRaw: "0",
          lockedAmountRaw: "0",
        });
      }

      const tok = tokenMap.get(tokenKey)!;
      tok.streamCount++;
      tok.totalAmountRaw  = (BigInt(tok.totalAmountRaw)  + BigInt(s.totalAmount  ?? "0")).toString();
      tok.claimableNowRaw = (BigInt(tok.claimableNowRaw) + BigInt(s.claimableNow ?? "0")).toString();
      tok.lockedAmountRaw = (BigInt(tok.lockedAmountRaw) + BigInt(s.lockedAmount ?? "0")).toString();
    }

    for (const { group, tokenMap } of byKey.values()) {
      group.tokens = [...tokenMap.values()].sort((a, b) => b.streamCount - a.streamCount);
    }

    const groups = [...byKey.values()]
      .map(({ group }) => group)
      .sort((a, b) => b.streamCount - a.streamCount);

    return NextResponse.json({
      address:      address.toLowerCase(),
      totalStreams: streams.length,
      groups,
      scannedAt:    new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /api/find-vestings error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
