// src/app/api/mobile/vestings/route.ts
// Mobile-auth equivalent of /api/vesting.
// Uses per-wallet chain/protocol/token filters from the DB, plus the same
// aggregate + cache layers as the web route so requests finish well under
// the mobile client's 15s timeout.
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { wallets as walletsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { readFromCache, writeToCache, readAllStreamsForWallets, mergeFreshWithCached } from "@/lib/vesting/dbcache";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?refresh=1 forces a live adapter run, bypassing the L1 DB cache. Mobile
  // pull-to-refresh sets this so users who just claimed on-chain see the
  // updated state immediately instead of waiting for the next adapter cron
  // (otherwise a "Ready to claim" row in the past tab would linger for up
  // to ACTIVE_TTL_SECONDS even after the user actually claimed). Mirrors
  // the same flag on the web /api/vesting route.
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  // Audit bonus: refresh hammers every adapter / subgraph / RPC the user's
  // wallet touches. A jailbroken device in a tight loop could amplify cost
  // significantly. 30/min per user is generous for legitimate pull-to-
  // refresh use (you'd never trigger that organically) and tight enough
  // that abuse is bounded. Non-refresh reads are uncapped — they're cache-
  // served and cheap.
  if (refresh) {
    const rl = await checkRateLimit("mobile:vestings:refresh", userId, 30, "1 m");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many refreshes — try again in a minute." },
        { status: 429 },
      );
    }
  }

  const userWallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!userWallets.length) return NextResponse.json({ streams: [] });

  const addresses = userWallets.map(w => w.address.toLowerCase());

  // Derive the minimum chain + protocol set to scan.
  // null on a wallet = no restriction (Pro/Fund scans everything).
  // If ANY wallet has no chain restriction, we must scan all chains — same for protocols.
  const anyWalletUnrestrictedChains    = userWallets.some(w => !w.chains    || w.chains.length === 0);
  const anyWalletUnrestrictedProtocols = userWallets.some(w => !w.protocols || w.protocols.length === 0);

  const chainIds: SupportedChainId[] = anyWalletUnrestrictedChains
    ? ALL_CHAIN_IDS
    : Array.from(new Set(
        userWallets.flatMap(w => (w.chains ?? []).map(c => Number(c)))
      )).filter((id): id is SupportedChainId => ALL_CHAIN_IDS.includes(id as SupportedChainId));

  const protocolIds: string[] | undefined = anyWalletUnrestrictedProtocols
    ? undefined
    : Array.from(new Set(userWallets.flatMap(w => w.protocols ?? [])));

  // Build per-wallet token-address filter (lowercased).
  const tokenFilters: Record<string, string> = {};
  for (const w of userWallets) {
    if (w.tokenAddress) tokenFilters[w.address.toLowerCase()] = w.tokenAddress.toLowerCase();
  }
  const hasTokenFilters = Object.keys(tokenFilters).length > 0;

  // ── L1: DB cache ────────────────────────────────────────────────────────────
  // Only safe when there are no adapter-level filters, since the cache is
  // keyed per-wallet and holds ALL protocols/chains for that wallet. Also
  // bypassed when the caller explicitly asked for fresh data (?refresh=1).
  const canUseCache = !protocolIds && !refresh;
  let streams: VestingStream[] = [];

  if (canUseCache) {
    const dbResult = await readFromCache(addresses);
    // Union with every cached row (any age). Keeps previously-discovered
    // streams visible despite the May 2 2026 setWhere TTL drift (unchanged
    // rows age past the TTL one-by-one while the wallet stays "fresh") and
    // transient adapter blips — the "every stream visible the moment they
    // open the app" guarantee.
    const allCached = await readAllStreamsForWallets(addresses);

    if (allCached.length > 0) {
      // ── Serve cache-first, revalidate in the background ──────────────────
      // Whenever we have ANY cached data, serve it INSTANTLY — never block the
      // app on a live multi-subgraph/RPC scan (the pain a user feels when they
      // open the app after weeks away). Refresh stale wallets in the
      // BACKGROUND so the next open / pull-to-refresh shows fresh data.
      // Pull-to-refresh (?refresh=1) still forces a blocking live fetch via
      // the else branch below. First-ever load with zero cache also blocks.
      streams = mergeFreshWithCached(dbResult.streams, allCached);
      if (dbResult.staleWallets.length > 0) {
        void aggregateVestingStreams(dbResult.staleWallets, chainIds, protocolIds)
          .then((fresh) => writeToCache(fresh))
          .catch((err) => console.error("[mobile/vestings] background refresh failed:", err));
      }
    } else {
      // No cache at all — first load. Block on the live fetch this once.
      streams = await aggregateVestingStreams(addresses, chainIds, protocolIds);
      void writeToCache(streams);
    }
    // Apply chain filter in memory (cache stores all chains per wallet)
    if (chainIds.length < ALL_CHAIN_IDS.length) {
      streams = streams.filter(s => chainIds.includes(s.chainId));
    }
  } else {
    // Cache disabled — either because a protocol filter is active OR the
    // caller passed ?refresh=1. Fetch live but still merge with the
    // last-known-good cache so a single transient adapter failure during
    // an explicit refresh doesn't drop streams the user can still see.
    const fresh = await aggregateVestingStreams(addresses, chainIds, protocolIds);
    if (refresh && !protocolIds) {
      const stale = await readAllStreamsForWallets(addresses);
      streams = mergeFreshWithCached(fresh, stale);
      void writeToCache(fresh);
    } else {
      streams = fresh;
    }
  }

  // ── Per-wallet token address filter (free-plan scoping) ─────────────────────
  if (hasTokenFilters) {
    streams = streams.filter(s => {
      const walletFilter = tokenFilters[(s.recipient ?? "").toLowerCase()];
      if (!walletFilter) return true;              // wallet has no filter → keep all
      return (s.tokenAddress ?? "").toLowerCase() === walletFilter;
    });
  }

  // Sort by next unlock (soonest first)
  streams.sort((a, b) => (a.nextUnlockTime ?? Infinity) - (b.nextUnlockTime ?? Infinity));

  return NextResponse.json(
    { streams },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
