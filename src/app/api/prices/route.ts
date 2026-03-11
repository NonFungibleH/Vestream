import { NextResponse } from "next/server";

// Fallback prices in case CoinGecko is unavailable
const FALLBACK: Record<string, number> = {
  USDC: 1,
  USDT: 1,
  DAI:  1,
  WETH: 3200,
  ETH:  3200,
  OP:   1.85,
  ARB:  0.85,
  BNB:  580,
  WBNB: 580,
};

// CoinGecko free-tier endpoint (no API key required, 30 req/min)
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price" +
  "?ids=usd-coin,tether,dai,wrapped-ether,ethereum,optimism,arbitrum,binancecoin" +
  "&vs_currencies=usd";

const SYMBOL_MAP: Record<string, string> = {
  "usd-coin":     "USDC",
  "tether":       "USDT",
  "dai":          "DAI",
  "wrapped-ether":"WETH",
  "ethereum":     "ETH",
  "optimism":     "OP",
  "arbitrum":     "ARB",
  "binancecoin":  "BNB",
};

export async function GET() {
  try {
    const res = await fetch(COINGECKO_URL, {
      // Cache for 5 minutes at the CDN/edge layer
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(FALLBACK, {
        headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
      });
    }

    const data = await res.json() as Record<string, { usd: number }>;

    const prices: Record<string, number> = { ...FALLBACK };
    for (const [id, vals] of Object.entries(data)) {
      const symbol = SYMBOL_MAP[id];
      if (symbol && typeof vals?.usd === "number") {
        prices[symbol] = vals.usd;
        // ETH and WETH should share the same price
        if (symbol === "ETH")  prices["WETH"] = vals.usd;
        if (symbol === "BNB")  prices["WBNB"] = vals.usd;
      }
    }

    return NextResponse.json(prices, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json(FALLBACK, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
    });
  }
}
