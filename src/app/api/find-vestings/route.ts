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

// Give the scan up to 25s on Vercel Pro before the infrastructure kills it.
// The programmatic timeout below fires at 22s so we always return a JSON
// error rather than letting the function hard-timeout into an HTML 504.
export const maxDuration = 25;
import { isValidWalletAddress, normaliseAddress, detectEcosystem } from "@/lib/address-validation";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { readFromCache, readAllStreamsForWallets, mergeFreshWithCached, writeToCache } from "@/lib/vesting/dbcache";
import { CHAIN_IDS, CHAIN_NAMES, type SupportedChainId, type VestingStream } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { logWalletSearch } from "@/lib/search-log";

// Chains the scanner fans out to, chosen by the address's ecosystem so we
// don't waste the scan budget cross-scanning (an EVM 0x wallet can't hold
// Solana vestings, and vice-versa). Individual adapters skip chains they don't
// support, so listing a chain here is safe — protocols without coverage just
// return []. Sepolia is included for EVM so the dev team can paste a test
// wallet with freshly-minted vestings and see them surface end-to-end.
//
// Previously this was a single EVM-only list missing Optimism, Avalanche AND
// Solana — so a wallet vesting only on those chains got a false "No vestings
// found". Fixed to cover every chain we actually index, per ecosystem.
const EVM_SCAN_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.AVALANCHE,
  CHAIN_IDS.SEPOLIA,
];
const SOLANA_SCAN_CHAINS: SupportedChainId[] = [CHAIN_IDS.SOLANA];

function scanChainsFor(address: string): SupportedChainId[] {
  return detectEcosystem(address) === "solana" ? SOLANA_SCAN_CHAINS : EVM_SCAN_CHAINS;
}

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
    return NextResponse.json({ error: "Invalid wallet address, expected EVM 0x… or Solana pubkey" }, { status: 400 });
  }

  // Log every search before any work happens — even searches that error
  // out are interesting signal (which wallets are people trying to scan?).
  // Fire-and-forget; never blocks the response.
  logWalletSearch({
    walletAddress: address,
    source:        "find_vestings",
    ip,
  });

  // normaliseAddress lowercases EVM but PRESERVES Solana base58 case.
  const normAddr   = normaliseAddress(address);
  const scanChains = scanChainsFor(address);

  try {
    // ── Cache-first ──────────────────────────────────────────────────────────
    // Serve any previously-indexed streams for this wallet INSTANTLY — the same
    // pattern the logged-in /api/vesting path uses — instead of blocking every
    // scan on a live multi-subgraph/RPC walk. A returning or already-tracked
    // wallet resolves in ~one DB read; only a wallet we've never seen pays the
    // live-scan cost, and that result is written through so the next scan is
    // instant too.
    const { streams: freshCached, staleWallets } = await readFromCache([normAddr]);
    const allCached = await readAllStreamsForWallets([normAddr]);

    if (allCached.length > 0) {
      const merged = mergeFreshWithCached(freshCached, allCached);
      // Refresh stale wallets in the background — the user never waits on it.
      if (staleWallets.length > 0) {
        void aggregateVestingStreams(staleWallets, scanChains)
          .then((fresh) => writeToCache(fresh))
          .catch((e) => console.error("[find-vestings] background refresh failed:", e));
      }
      const { groups, totalStreams } = buildGroups(merged);
      return NextResponse.json({
        address:      normAddr,
        totalStreams,
        groups,
        scannedAt:    new Date().toISOString(),
        cached:       true,
      });
    }

    // ── Cold: a wallet we've never indexed → live scan (bounded), then write
    // through so re-scans are instant. Belt-and-suspenders 22s timeout throws a
    // clean JSON error rather than letting Vercel's 25s infra timeout fire an
    // HTML 504 the client can't parse.
    const SCAN_BUDGET_MS = 22_000;
    const streams = await Promise.race([
      aggregateVestingStreams([normAddr], scanChains),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Scan timed out, please try again")), SCAN_BUDGET_MS),
      ),
    ]);
    if (streams.length > 0) {
      void writeToCache(streams).catch((e) => console.error("[find-vestings] write-through failed:", e));
    }

    const { groups, totalStreams } = buildGroups(streams);
    return NextResponse.json({
      address:      normAddr,
      totalStreams,
      groups,
      scannedAt:    new Date().toISOString(),
      cached:       false,
    });
  } catch (err) {
    console.error("GET /api/find-vestings error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

// Group a flat stream list into the protocol × chain × token summary the
// /find-vestings page renders. Shared by the cache-first and live-scan paths.
function buildGroups(streams: VestingStream[]): { groups: FindVestingsGroup[]; totalStreams: number } {
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

  return { groups, totalStreams: streams.length };
}
