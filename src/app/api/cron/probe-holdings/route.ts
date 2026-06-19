// src/app/api/cron/probe-holdings/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY SPIKE — feasibility probe for the Smart Money "Also holds" feature.
//
// Question it answers (in PRODUCTION, where the real RPC keys live):
//   1. Do our prod RPCs actually support wallet token-balance enumeration?
//      (Alchemy `alchemy_getTokenBalances` for EVM, DAS `getAssetsByOwner` for
//      Solana — both unavailable on the local dev RPCs.)
//   2. Do the leaderboard wallets actually HOLD priced, non-vesting tokens, or
//      is their value entirely locked in vesting contracts (empty spot bags)?
//
// Read-only: no schema, no writes, no UI. Reports coverage as JSON. If coverage
// is good we build the real feature (persist holdings + render a strip); if the
// wallets hold nothing, we delete this route and shelve Part B. DELETE AFTER USE.
//
// Auth: same Bearer-token gate as the other crons.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import { db } from "@/lib/db";
import { smartMoneySnapshot, vestingStreamsCache, tokenPricesCache } from "@/lib/db/schema";
import { sql, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// EVM chains we can enumerate (the chains with a real Alchemy key in prod).
const EVM_RPC: Record<number, string | undefined> = {
  1:    process.env.ALCHEMY_RPC_URL_ETH,
  8453: process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL,
};
const SOLANA_RPC = process.env.SOLANA_RPC_URL;
const USD_FLOOR = 500;     // ignore holdings below this — dust, not signal
const TOP_PER_WALLET = 5;

type PriceInfo = { price: number; liquidity: number };
type Holding = { chainId: number; address: string; symbol: string | null; usd: number };

async function rpc(url: string, method: string, params: unknown): Promise<{ result?: unknown; error?: { message: string } }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  return res.json();
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Load leaderboard wallets + their vesting token sets + the price cache ──
  const snap = await db
    .select({ rank: smartMoneySnapshot.rank, recipient: smartMoneySnapshot.recipient, eco: smartMoneySnapshot.chainEcosystem })
    .from(smartMoneySnapshot)
    .orderBy(smartMoneySnapshot.rank);
  if (snap.length === 0) return NextResponse.json({ error: "no snapshot" }, { status: 400 });

  const recipients = snap.map((s) => s.recipient);
  const vestingRows = await db
    .select({ recipient: vestingStreamsCache.recipient, chainId: vestingStreamsCache.chainId, tokenAddress: vestingStreamsCache.tokenAddress })
    .from(vestingStreamsCache)
    .where(inArray(vestingStreamsCache.recipient, recipients));
  const vestingByWallet = new Map<string, Set<string>>();
  for (const r of vestingRows) {
    if (!r.tokenAddress) continue;
    const set = vestingByWallet.get(r.recipient) ?? new Set<string>();
    set.add(`${r.chainId}:${r.tokenAddress.toLowerCase()}`);
    vestingByWallet.set(r.recipient, set);
  }

  const priceRows = await db
    .select({ chainId: tokenPricesCache.chainId, tokenAddress: tokenPricesCache.tokenAddress, priceUsd: tokenPricesCache.priceUsd, liquidityUsd: tokenPricesCache.liquidityUsd })
    .from(tokenPricesCache)
    .where(sql`${tokenPricesCache.priceUsd} > 0`);
  const priceInfo = new Map<string, PriceInfo>();
  for (const r of priceRows) {
    priceInfo.set(`${r.chainId}:${r.tokenAddress.toLowerCase()}`, {
      price: Number(r.priceUsd),
      liquidity: r.liquidityUsd != null ? Number(r.liquidityUsd) : 0,
    });
  }

  const providerErrors: Record<string, string> = {};
  const evmMetaCache = new Map<string, number>(); // chainId:addr -> decimals

  // ── Fetch holdings for one wallet ─────────────────────────────────────────
  async function holdingsFor(wallet: string, eco: string): Promise<Holding[]> {
    const vest = vestingByWallet.get(wallet) ?? new Set<string>();
    const out: Holding[] = [];

    if (eco === "evm") {
      for (const [chainId, url] of Object.entries(EVM_RPC)) {
        if (!url) continue;
        const cid = Number(chainId);
        let bal: { result?: { tokenBalances?: Array<{ contractAddress: string; tokenBalance: string }> }; error?: { message: string } };
        try { bal = await rpc(url, "alchemy_getTokenBalances", [wallet, "erc20"]) as typeof bal; }
        catch (e) { providerErrors[`evm:${cid}`] = String(e); continue; }
        if (bal.error) { providerErrors[`evm:${cid}`] = bal.error.message; continue; }
        const held = (bal.result?.tokenBalances ?? []).filter((t) => t.tokenBalance && BigInt(t.tokenBalance) > 0n);
        // Keep only priced, non-vesting tokens.
        const candidates = held
          .map((t) => ({ key: `${cid}:${t.contractAddress.toLowerCase()}`, contract: t.contractAddress, raw: BigInt(t.tokenBalance) }))
          .filter((c) => priceInfo.has(c.key) && !vest.has(c.key));
        for (const c of candidates) {
          // Decimals via metadata (cached across wallets).
          let decimals = evmMetaCache.get(c.key);
          if (decimals == null) {
            try {
              const meta = await rpc(url, "alchemy_getTokenMetadata", [c.contract]) as { result?: { decimals?: number; symbol?: string } };
              decimals = typeof meta.result?.decimals === "number" ? meta.result.decimals : 18;
              evmMetaCache.set(c.key, decimals);
            } catch { decimals = 18; }
          }
          const info = priceInfo.get(c.key)!;
          const tokens = Number(c.raw) / 10 ** decimals;
          const gross = tokens * info.price;
          const usd = info.liquidity > 0 ? Math.min(gross, info.liquidity) : gross;
          if (isFinite(usd) && usd >= USD_FLOOR) out.push({ chainId: cid, address: c.contract, symbol: null, usd });
        }
      }
    } else if (eco === "solana" && SOLANA_RPC) {
      let r: { result?: { items?: Array<Record<string, unknown>> }; error?: { message: string } };
      try { r = await rpc(SOLANA_RPC, "getAssetsByOwner", { ownerAddress: wallet, page: 1, limit: 100, displayOptions: { showFungible: true } }) as typeof r; }
      catch (e) { providerErrors["solana"] = String(e); return out; }
      if (r.error) { providerErrors["solana"] = r.error.message; return out; }
      for (const item of r.result?.items ?? []) {
        const iface = item.interface as string | undefined;
        if (iface !== "FungibleToken" && iface !== "FungibleAsset") continue;
        const mint = (item.id as string ?? "").toLowerCase();
        const key = `101:${mint}`;
        if (vest.has(key)) continue;
        const ti = item.token_info as { symbol?: string; price_info?: { total_price?: number } } | undefined;
        const total = ti?.price_info?.total_price;
        if (typeof total !== "number") continue;
        // Cap at our cache liquidity when we know it (kills thin-pair inflation).
        const cache = priceInfo.get(key);
        const usd = cache && cache.liquidity > 0 ? Math.min(total, cache.liquidity) : total;
        if (isFinite(usd) && usd >= USD_FLOOR) out.push({ chainId: 101, address: mint, symbol: ti?.symbol ?? null, usd });
      }
    }

    out.sort((a, b) => b.usd - a.usd);
    return out.slice(0, TOP_PER_WALLET);
  }

  // ── Run over all wallets, bounded concurrency ─────────────────────────────
  const results: Array<{ rank: number; wallet: string; eco: string; holdings: Holding[] }> = [];
  const BATCH = 6;
  for (let i = 0; i < snap.length; i += BATCH) {
    const slice = snap.slice(i, i + BATCH);
    const batch = await Promise.all(slice.map(async (s) => ({
      rank: s.rank, wallet: s.recipient, eco: s.eco, holdings: await holdingsFor(s.recipient, s.eco).catch(() => [] as Holding[]),
    })));
    results.push(...batch);
  }

  // ── Aggregate report ──────────────────────────────────────────────────────
  const evm = results.filter((r) => r.eco === "evm");
  const sol = results.filter((r) => r.eco === "solana");
  const withHoldings = results.filter((r) => r.holdings.length > 0);
  const examples = [...withHoldings]
    .sort((a, b) => b.holdings.reduce((s, h) => s + h.usd, 0) - a.holdings.reduce((s, h) => s + h.usd, 0))
    .slice(0, 12)
    .map((r) => ({
      rank: r.rank, eco: r.eco, wallet: r.wallet.slice(0, 12) + "…",
      totalUsd: Math.round(r.holdings.reduce((s, h) => s + h.usd, 0)),
      holds: r.holdings.map((h) => ({ chain: h.chainId, sym: h.symbol, usd: Math.round(h.usd) })),
    }));

  return NextResponse.json({
    ok: true,
    walletsTotal: results.length,
    evmWallets: evm.length,
    solWallets: sol.length,
    walletsWithPricedNonVestingHoldings: withHoldings.length,
    coveragePct: Math.round((withHoldings.length / results.length) * 100),
    evmWithHoldings: evm.filter((r) => r.holdings.length > 0).length,
    solWithHoldings: sol.filter((r) => r.holdings.length > 0).length,
    providerErrors,
    examples,
  });
}
