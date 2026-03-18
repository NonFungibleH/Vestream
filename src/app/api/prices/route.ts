import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";

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

export async function GET(req: NextRequest) {
  // Rate limit: 60 price lookups per IP per minute (protects CoinGecko free tier)
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = await checkRateLimit("prices", ip, 60, "1 m");
  if (!rl.allowed) {
    return NextResponse.json(FALLBACK, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) },
    });
  }

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
