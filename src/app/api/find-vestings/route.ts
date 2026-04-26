// src/app/api/find-vestings/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public wallet scan endpoint used by the /find-vestings page.
//
//   - Unauthenticated — designed to funnel users into the mobile app
//   - Rate-limited (5 scans per IP per hour, 20 per day)
//   - Four production mainnets + Sepolia (for QA / dev wallets)
//   - Returns a lightweight per-protocol×chain summary, not raw streams
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { CHAIN_IDS, CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

// Chains the scanner fans out to. Mainnets are the primary signal; Sepolia is
// included so the dev team can paste a test wallet with freshly-minted
// vestings and see them surface end-to-end (Sepolia-specific adapters and
// subgraphs are wired for every protocol that has a testnet deployment).
// Individual adapters skip chains they don't support, so adding a chain here
// is safe — protocols without coverage just return [].
const SCAN_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.SEPOLIA,
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
  const burstBlocked = rateLimitResponse(burst, "Rate limit: 5 scans per hour. Try again in a few minutes.");
  if (burstBlocked) return burstBlocked;
  const daily = await checkRateLimit("find-vestings-daily", ip, 20, "1 d");
  const dailyBlocked = rateLimitResponse(daily, "Rate limit: 20 scans per day. Sign up for the app to remove the limit.");
  if (dailyBlocked) return dailyBlocked;

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
  }

  try {
    const streams = await aggregateVestingStreams([normaliseAddress(address)], SCAN_CHAINS);

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
