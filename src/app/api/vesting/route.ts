import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";
import { checkRateLimit } from "@/lib/ratelimit";
import { readFromCache, writeToCache } from "@/lib/vesting/dbcache";

// ─── Hot in-memory cache (L1) ─────────────────────────────────────────────────
// Avoids DB round-trips for the same request within a single server instance.
// The DB cache (L2) handles persistence across restarts and different instances.
const CACHE_TTL_MS = 5 * 60 * 1000;
const hotCache = new Map<string, { streams: VestingStream[]; expiresAt: number; fetchedAt: string }>();

function cacheKey(
  wallets:      string[],
  chainIds:     SupportedChainId[],
  protocolIds?: string[],
  tokenFilters?: Record<string, string>,
): string {
  const p = protocolIds ? `_${[...protocolIds].sort().join(",")}` : "";
  const t = tokenFilters && Object.keys(tokenFilters).length > 0
    ? `_${Object.entries(tokenFilters).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(",")}`
    : "";
  return `${[...wallets].sort().join(",")}_${[...chainIds].sort().join(",")}${p}${t}`;
}

function evictStale() {
  const now = Date.now();
  for (const [k, v] of hotCache) {
    if (v.expiresAt < now) hotCache.delete(k);
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 30 vesting lookups per user per minute (subgraph calls are expensive)
  const rl = await checkRateLimit("vesting", session.address, 30, "1 m");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const { searchParams } = new URL(req.url);
  const walletsParam      = searchParams.get("wallets");
  const chainsParam       = searchParams.get("chains");
  const protocolsParam    = searchParams.get("protocols");
  const tokenFiltersParam = searchParams.get("tokenFilters");
  const refresh           = searchParams.get("refresh") === "1";

  if (!walletsParam) {
    return NextResponse.json({ error: "No wallets provided" }, { status: 400 });
  }

  const wallets = walletsParam
    .split(",")
    .map((w) => w.trim())
    .filter((w) => isAddress(w));

  if (wallets.length === 0) {
    return NextResponse.json({ error: "No valid addresses" }, { status: 400 });
  }

  // Parse chain filter
  let chainIds: SupportedChainId[] = ALL_CHAIN_IDS;
  if (chainsParam) {
    const requested = chainsParam.split(",").map((c) => Number(c.trim()));
    const valid = requested.filter((id): id is SupportedChainId =>
      ALL_CHAIN_IDS.includes(id as SupportedChainId)
    );
    if (valid.length > 0) chainIds = valid;
  }

  // Parse protocol filter
  let protocolIds: string[] | undefined;
  if (protocolsParam) {
    const ids = protocolsParam.split(",").map((p) => p.trim()).filter(Boolean);
    if (ids.length > 0) protocolIds = ids;
  }

  // Parse per-wallet token filters
  const tokenFilters: Record<string, string> = {};
  if (tokenFiltersParam) {
    for (const pair of tokenFiltersParam.split(",")) {
      const [walletAddr, tokenAddr] = pair.split(":").map(s => s.trim());
      if (walletAddr && tokenAddr && isAddress(walletAddr) && isAddress(tokenAddr)) {
        tokenFilters[walletAddr.toLowerCase()] = tokenAddr.toLowerCase();
      }
    }
  }

  const hasTokenFilters = Object.keys(tokenFilters).length > 0;

  // ── L1: hot in-memory cache ─────────────────────────────────────────────────
  const key    = cacheKey(wallets, chainIds, protocolIds, hasTokenFilters ? tokenFilters : undefined);
  const hotHit = !refresh ? hotCache.get(key) : undefined;
  if (hotHit && hotHit.expiresAt > Date.now()) {
    return NextResponse.json(
      { streams: hotHit.streams, fetchedAt: hotHit.fetchedAt, cached: "memory" },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
    );
  }

  // ── L2: persistent DB cache ──────────────────────────────────────────────────
  // Only use DB cache when no chain/protocol/token filters are active
  // (we store per-wallet, then filter in memory — avoids cache fragmentation)
  const useDbCache = !refresh && !protocolIds && !hasTokenFilters;
  if (useDbCache) {
    const dbResult = await readFromCache(wallets);
    if (dbResult.isFresh) {
      // All wallets had fresh data — apply chain filter in memory and serve
      let streams = dbResult.streams;
      if (chainIds !== ALL_CHAIN_IDS) {
        streams = streams.filter((s) => chainIds.includes(s.chainId));
      }
      const fetchedAt = new Date().toISOString();
      hotCache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
      return NextResponse.json(
        { streams, fetchedAt, cached: "db" },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
      );
    }

    // Partial hit: some wallets were fresh, some need re-fetching
    if (dbResult.staleWallets.length < wallets.length) {
      const freshStreams = dbResult.streams;
      const freshData    = await aggregateVestingStreams(dbResult.staleWallets, chainIds, protocolIds);
      // Write only the newly fetched streams back to DB (fire-and-forget)
      void writeToCache(freshData);

      let streams = [...freshStreams, ...freshData];
      if (chainIds !== ALL_CHAIN_IDS) {
        streams = streams.filter((s) => chainIds.includes(s.chainId));
      }
      const fetchedAt = new Date().toISOString();
      hotCache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
      return NextResponse.json(
        { streams, fetchedAt, cached: "partial" },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
      );
    }
  }

  // ── L3: full subgraph fetch ──────────────────────────────────────────────────
  const fetchedAt = new Date().toISOString();
  let streams     = await aggregateVestingStreams(wallets, chainIds, protocolIds);

  // Apply per-wallet token filter
  if (hasTokenFilters) {
    streams = streams.filter((s) => {
      const walletFilter = tokenFilters[(s.recipient ?? "").toLowerCase()];
      if (!walletFilter) return true;
      return (s.tokenAddress ?? "").toLowerCase() === walletFilter;
    });
  }

  // Write to DB cache (fire-and-forget — never blocks response)
  void writeToCache(streams);

  // Write to hot cache
  hotCache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
  if (hotCache.size > 200) evictStale();

  return NextResponse.json(
    { streams, fetchedAt },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
  );
}
