// src/app/api/cron/probe-holdings/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY SPIKE — feasibility probe for the Smart Money "Also holds" feature.
//
// Measures, in PRODUCTION, how many leaderboard wallets hold priced, non-vesting
// tokens once we use Moralis for multichain balance enumeration (the earlier
// Alchemy-only probe covered just ETH+Base and got ~10%; the 38 BSC wallets were
// blind). Moralis' wallet-tokens endpoint returns balances WITH price + USD +
// metadata in one call, across eth/bsc/base/polygon/arbitrum/optimism.
//
// Read-only: no schema, no writes, no UI. Reports coverage as JSON. If coverage
// is good we build the real feature; otherwise we delete this route. DELETE
// AFTER the Part B go/no-go decision.
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

// Moralis EVM chain slugs → our chain IDs.
const MORALIS_CHAINS: Array<{ slug: string; chainId: number }> = [
  { slug: "eth",      chainId: 1 },
  { slug: "bsc",      chainId: 56 },
  { slug: "base",     chainId: 8453 },
  { slug: "polygon",  chainId: 137 },
  { slug: "arbitrum", chainId: 42161 },
  { slug: "optimism", chainId: 10 },
];
const USD_FLOOR = 500;     // ignore holdings below this — dust, not signal
const TOP_PER_WALLET = 5;

type PriceInfo = { liquidity: number };
type Holding = { chainId: number; address: string; symbol: string | null; usd: number };

interface MoralisToken {
  token_address?:    string;
  symbol?:           string;
  decimals?:         number;
  usd_value?:        number | null;
  possible_spam?:    boolean;
  verified_contract?: boolean;
  native_token?:     boolean;
}

async function moralisTokens(address: string, slug: string, apiKey: string): Promise<{ tokens?: MoralisToken[]; error?: string }> {
  try {
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens?chain=${slug}&exclude_spam=true&limit=100`,
      { headers: { "X-API-Key": apiKey, accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return { error: `${slug}:${res.status}` };
    const data = await res.json() as { result?: MoralisToken[] };
    return { tokens: data.result ?? [] };
  } catch (e) {
    return { error: `${slug}:${String(e)}` };
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MORALIS_API_KEY not set in this environment — add it to Vercel (Production) first." }, { status: 400 });
  }

  // ── Load leaderboard wallets + their vesting token sets + cache liquidity ──
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
    .select({ chainId: tokenPricesCache.chainId, tokenAddress: tokenPricesCache.tokenAddress, liquidityUsd: tokenPricesCache.liquidityUsd })
    .from(tokenPricesCache)
    .where(sql`${tokenPricesCache.priceUsd} > 0`);
  const liqInfo = new Map<string, PriceInfo>();
  for (const r of priceRows) {
    liqInfo.set(`${r.chainId}:${r.tokenAddress.toLowerCase()}`, { liquidity: r.liquidityUsd != null ? Number(r.liquidityUsd) : 0 });
  }

  const providerErrors: Record<string, string> = {};

  // ── Fetch non-vesting holdings for one EVM wallet across all Moralis chains ─
  async function holdingsFor(wallet: string): Promise<Holding[]> {
    const vest = vestingByWallet.get(wallet) ?? new Set<string>();
    const out: Holding[] = [];
    // One Moralis call per chain. Sequential to stay polite on the free tier.
    for (const { slug, chainId } of MORALIS_CHAINS) {
      const { tokens, error } = await moralisTokens(wallet, slug, apiKey!);
      if (error) { providerErrors[slug] = error; continue; }
      for (const t of tokens ?? []) {
        if (t.native_token || t.possible_spam || !t.token_address) continue;
        const usdRaw = typeof t.usd_value === "number" ? t.usd_value : 0;
        if (usdRaw <= 0) continue;
        const key = `${chainId}:${t.token_address.toLowerCase()}`;
        if (vest.has(key)) continue; // it's a vesting token — not a "non-vesting holding"
        // Cap at our cache liquidity when we know it (kills thin-pair inflation).
        const cache = liqInfo.get(key);
        const usd = cache && cache.liquidity > 0 ? Math.min(usdRaw, cache.liquidity) : usdRaw;
        if (isFinite(usd) && usd >= USD_FLOOR) out.push({ chainId, address: t.token_address, symbol: t.symbol ?? null, usd });
      }
    }
    out.sort((a, b) => b.usd - a.usd);
    return out.slice(0, TOP_PER_WALLET);
  }

  // ── Run over EVM wallets (Moralis is EVM here; Solana left for later) ──────
  const evmSnap = snap.filter((s) => s.eco === "evm");
  const results: Array<{ rank: number; wallet: string; holdings: Holding[] }> = [];
  const BATCH = 4;
  for (let i = 0; i < evmSnap.length; i += BATCH) {
    const slice = evmSnap.slice(i, i + BATCH);
    const batch = await Promise.all(slice.map(async (s) => ({
      rank: s.rank, wallet: s.recipient, holdings: await holdingsFor(s.recipient).catch(() => [] as Holding[]),
    })));
    results.push(...batch);
  }

  const withHoldings = results.filter((r) => r.holdings.length > 0);
  const examples = [...withHoldings]
    .sort((a, b) => b.holdings.reduce((s, h) => s + h.usd, 0) - a.holdings.reduce((s, h) => s + h.usd, 0))
    .slice(0, 15)
    .map((r) => ({
      rank: r.rank, wallet: r.wallet.slice(0, 12) + "…",
      totalUsd: Math.round(r.holdings.reduce((s, h) => s + h.usd, 0)),
      holds: r.holdings.map((h) => ({ chain: h.chainId, sym: h.symbol, usd: Math.round(h.usd) })),
    }));

  return NextResponse.json({
    ok: true,
    evmWallets: evmSnap.length,
    evmWithHoldings: withHoldings.length,
    coveragePctOfEvm: Math.round((withHoldings.length / Math.max(1, evmSnap.length)) * 100),
    providerErrors,
    examples,
  });
}
