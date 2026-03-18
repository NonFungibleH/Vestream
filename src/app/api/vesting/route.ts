import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";
import { checkRateLimit } from "@/lib/ratelimit";

// ─── Server-side in-memory cache ──────────────────────────────────────────────
// Keyed by sorted wallets + chain IDs + protocol IDs + token filters. TTL: 5 min.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { streams: VestingStream[]; expiresAt: number; fetchedAt: string }>();

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

// Evict stale entries periodically to avoid unbounded growth
function evictStale() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
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
  const walletsParam   = searchParams.get("wallets");
  const chainsParam    = searchParams.get("chains");       // optional e.g. "1,56,8453"
  const protocolsParam = searchParams.get("protocols");    // optional e.g. "sablier,uncx"
  // tokenFilters: "walletAddr:tokenAddr,walletAddr2:tokenAddr2" — per-wallet token filter
  const tokenFiltersParam = searchParams.get("tokenFilters");
  const refresh        = searchParams.get("refresh") === "1";

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

  // Parse chain filter (default: all supported chains)
  let chainIds: SupportedChainId[] = ALL_CHAIN_IDS;
  if (chainsParam) {
    const requested = chainsParam.split(",").map((c) => Number(c.trim()));
    const valid = requested.filter((id): id is SupportedChainId =>
      ALL_CHAIN_IDS.includes(id as SupportedChainId)
    );
    if (valid.length > 0) chainIds = valid;
  }

  // Parse protocol filter (default: all adapters)
  let protocolIds: string[] | undefined;
  if (protocolsParam) {
    const ids = protocolsParam.split(",").map((p) => p.trim()).filter(Boolean);
    if (ids.length > 0) protocolIds = ids;
  }

  // Parse per-wallet token address filters: "walletAddr:tokenAddr,..."
  const tokenFilters: Record<string, string> = {};
  if (tokenFiltersParam) {
    for (const pair of tokenFiltersParam.split(",")) {
      const [walletAddr, tokenAddr] = pair.split(":").map(s => s.trim());
      if (walletAddr && tokenAddr && isAddress(walletAddr) && isAddress(tokenAddr)) {
        tokenFilters[walletAddr.toLowerCase()] = tokenAddr.toLowerCase();
      }
    }
  }

  // Check cache (skip if ?refresh=1)
  const key    = cacheKey(wallets, chainIds, protocolIds, Object.keys(tokenFilters).length > 0 ? tokenFilters : undefined);
  const cached = !refresh ? cache.get(key) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { streams: cached.streams, fetchedAt: cached.fetchedAt, cached: true },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
    );
  }

  const fetchedAt = new Date().toISOString();
  let streams     = await aggregateVestingStreams(wallets, chainIds, protocolIds);

  // Post-filter streams by per-wallet token address
  if (Object.keys(tokenFilters).length > 0) {
    streams = streams.filter((s) => {
      const walletFilter = tokenFilters[(s.recipient ?? "").toLowerCase()];
      if (!walletFilter) return true; // no filter for this wallet
      return (s.tokenAddress ?? "").toLowerCase() === walletFilter;
    });
  }

  // Store in cache
  cache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
  if (cache.size > 200) evictStale();

  return NextResponse.json(
    { streams, fetchedAt },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
  );
}
