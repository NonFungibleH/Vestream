import { NextRequest, NextResponse } from "next/server";

// DexScreener chain IDs → URL slugs
const CHAIN_TO_DS: Record<number, string> = {
  1:    "ethereum",
  56:   "bsc",
  8453: "base",
};

// DexTools chain slugs (for external links)
const CHAIN_TO_DEXTOOLS: Record<number, string> = {
  1:    "ether",
  56:   "bnb",
  8453: "base",
};

export interface TokenMarket {
  symbol:                string;
  address:               string | null;
  chainId:               number | null;
  marketCap:             number | null;
  fullyDilutedValuation: number | null;
  change1h:              number | null;
  change6h:              number | null;
  change24h:             number | null;
  volume24h:             number | null;
  price:                 number | null;
  liquidity:             "high" | "medium" | "low" | "unknown";
  liquidityUsd:          number | null;
  dexScreenerUrl:        string | null;
  dexToolsUrl:           string | null;
  // Enriched info from DexScreener
  tokenName:             string | null;
  imageUrl:              string | null;
  website:               string | null;
  docs:                  string | null;
  socials:               { type: string; url: string }[];
}

function liquidityTier(usd: number | null): TokenMarket["liquidity"] {
  if (!usd || usd === 0) return "unknown";
  if (usd >= 500_000) return "high";
  if (usd >= 50_000)  return "medium";
  return "low";
}

interface DexPair {
  chainId:     string;
  url:         string;
  pairAddress: string;
  baseToken:   { address: string; symbol: string; name: string };
  priceUsd?:   string;
  volume?:     { h24?: number };
  priceChange?:{ h1?: number; h6?: number; h24?: number };
  liquidity?:  { usd?: number };
  fdv?:        number;
  marketCap?:  number;
  info?: {
    imageUrl?:  string;
    header?:    string;
    websites?:  { label: string; url: string }[];
    socials?:   { type: string; url: string }[];
  };
}

// Fetch pairs by token address — no Next.js caching so we always get fresh data
async function fetchByAddress(address: string): Promise<DexPair[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`,
      { cache: "no-store", headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.pairs ?? []) as DexPair[];
  } catch {
    return [];
  }
}

// Fallback: search by symbol — useful when address isn't in DexScreener
async function fetchBySymbol(symbol: string): Promise<DexPair[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`,
      { cache: "no-store", headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Filter to exact symbol matches on the base token
    return ((data.pairs ?? []) as DexPair[]).filter(
      (p) => p.baseToken.symbol.toUpperCase() === symbol.toUpperCase()
    );
  } catch {
    return [];
  }
}

function pickBestPair(pairs: DexPair[], preferChain: string | null): DexPair | null {
  const withPrice = pairs.filter((p) => p.priceUsd && parseFloat(p.priceUsd) > 0);
  if (withPrice.length === 0) return null;

  // Prefer correct chain, fall back to all
  const onChain = preferChain ? withPrice.filter((p) => p.chainId === preferChain) : [];
  const pool    = onChain.length > 0 ? onChain : withPrice;

  // Sort by 24h volume — matches DexScreener's own ranking, giving the primary pair
  // whose marketCap / FDV / price align with what DexScreener displays on the token page.
  return pool.sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))[0];
}

function extractInfo(pair: DexPair) {
  const info     = pair.info ?? {};
  const sites    = info.websites ?? [];
  const socials  = (info.socials ?? []).map((s) => ({ type: s.type, url: s.url }));

  const website  = sites.find((w) => w.label?.toLowerCase() === "website")?.url
    ?? sites.find((w) => !w.label?.toLowerCase().includes("doc") && !w.label?.toLowerCase().includes("link"))?.url
    ?? sites[0]?.url
    ?? null;

  const docs     = sites.find((w) => w.label?.toLowerCase().includes("doc"))?.url ?? null;

  return {
    tokenName: pair.baseToken?.name ?? null,
    imageUrl:  info.imageUrl ?? null,
    website,
    docs,
    socials,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tokensParam  = searchParams.get("tokens")  ?? "";
  const symbolsParam = searchParams.get("symbols") ?? "";

  type TokenInput = { symbol: string; address: string | null; chainId: number | null };
  let inputs: TokenInput[] = [];

  if (tokensParam) {
    inputs = tokensParam.split(",").flatMap((part) => {
      const [sym, addr, cid] = part.split(":");
      if (!sym) return [];
      return [{ symbol: sym.toUpperCase(), address: addr || null, chainId: cid ? Number(cid) : null }];
    });
  } else if (symbolsParam) {
    inputs = symbolsParam.split(",")
      .map((s) => s.trim().toUpperCase()).filter(Boolean)
      .map((symbol) => ({ symbol, address: null, chainId: null }));
  }

  // Deduplicate by symbol
  const seen = new Set<string>();
  inputs = inputs.filter((t) => t.symbol && !seen.has(t.symbol) && !!seen.add(t.symbol));

  if (inputs.length === 0) return NextResponse.json({ market: [] });

  const result: TokenMarket[] = inputs.map((t) => ({
    symbol:                t.symbol,
    address:               t.address,
    chainId:               t.chainId,
    marketCap:             null,
    fullyDilutedValuation: null,
    change1h:              null,
    change6h:              null,
    change24h:             null,
    volume24h:             null,
    price:                 null,
    liquidity:             "unknown",
    liquidityUsd:          null,
    dexScreenerUrl:
      t.address && t.chainId && CHAIN_TO_DS[t.chainId]
        ? `https://dexscreener.com/${CHAIN_TO_DS[t.chainId]}/${t.address}`
        : null,
    dexToolsUrl:
      t.address && t.chainId && CHAIN_TO_DEXTOOLS[t.chainId]
        ? `https://www.dextools.io/app/en/${CHAIN_TO_DEXTOOLS[t.chainId]}/token/${t.address}`
        : null,
    tokenName: null,
    imageUrl:  null,
    website:   null,
    docs:      null,
    socials:   [],
  }));

  await Promise.all(
    inputs.map(async (token, idx) => {
      const dsChain = token.chainId ? CHAIN_TO_DS[token.chainId] : null;

      // 1. Try address lookup first (most accurate)
      let pairs: DexPair[] = token.address ? await fetchByAddress(token.address) : [];

      // 2. Fall back to symbol search if address returned nothing.
      //    This handles tokens whose stored address isn't indexed by DexScreener
      //    (e.g. old contract, LP pair address, or pre-migration contract) — the
      //    symbol search finds the best matching pair by ticker and 24h volume.
      if (pairs.length === 0) {
        pairs = await fetchBySymbol(token.symbol);
      }

      const best = pickBestPair(pairs, dsChain);
      if (!best) return;

      const price   = parseFloat(best.priceUsd ?? "0");
      const liqUsd  = best.liquidity?.usd ?? null;
      const info    = extractInfo(best);

      result[idx].price                 = price > 0 ? price : null;
      result[idx].change1h              = best.priceChange?.h1  ?? null;
      result[idx].change6h              = best.priceChange?.h6  ?? null;
      result[idx].change24h             = best.priceChange?.h24 ?? null;
      result[idx].volume24h             = best.volume?.h24    ?? null;
      result[idx].marketCap             = best.marketCap      ?? null;
      result[idx].fullyDilutedValuation = best.fdv            ?? null;
      result[idx].liquidity             = liquidityTier(liqUsd);
      result[idx].liquidityUsd          = liqUsd;
      result[idx].dexScreenerUrl        = best.url ?? result[idx].dexScreenerUrl;
      result[idx].tokenName             = info.tokenName;
      result[idx].imageUrl              = info.imageUrl;
      result[idx].website               = info.website;
      result[idx].docs                  = info.docs;
      result[idx].socials               = info.socials;
    })
  );

  return NextResponse.json({ market: result }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}
