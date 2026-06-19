// src/lib/currency.ts
// ─────────────────────────────────────────────────────────────────────────────
// Multi-currency display infrastructure.
//
// Vestream's source of truth is USD (every token price + every locked-value
// calculation flows through `quick-prices.ts` in USD). For display, users
// outside the US prefer to see their portfolio in their local currency.
// This module provides:
//
//   - SUPPORTED_CURRENCIES: the closed set of currencies we offer
//   - getRates(): server-side fetch of FX rates (Upstash-cached 1h)
//   - formatMoney(usd, currency, rate): client-side formatter that
//     converts + formats with the right symbol and locale
//
// FX provider: exchangerate.host — free, no API key, JSON response.
// Cached for 1 hour; outside that window we re-fetch. If the fetch fails
// we serve stale rates rather than show "—" everywhere.
//
// Important: this is for DISPLAY only. Tax exports must use HISTORICAL
// rates at the date of each event (a UK self-assessment requires GBP at
// receipt, not GBP at today's rate). The historical-FX layer ships with
// the Tax-ready claim history feature, not here.
// ─────────────────────────────────────────────────────────────────────────────

import { Redis } from "@upstash/redis";

export type CurrencyCode = "USD" | "GBP" | "EUR" | "SGD" | "JPY" | "CHF" | "AUD" | "CAD" | "INR" | "BRL";

export interface CurrencyMeta {
  code:   CurrencyCode;
  symbol: string;
  /** locale used for `toLocaleString` formatting */
  locale: string;
  /** decimals to display in compact mode — JPY shows whole units */
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: "USD", symbol: "$",  locale: "en-US", decimals: 2 },
  { code: "GBP", symbol: "£",  locale: "en-GB", decimals: 2 },
  { code: "EUR", symbol: "€",  locale: "en-IE", decimals: 2 },
  { code: "SGD", symbol: "S$", locale: "en-SG", decimals: 2 },
  { code: "JPY", symbol: "¥",  locale: "ja-JP", decimals: 0 },
  { code: "CHF", symbol: "CHF",locale: "de-CH", decimals: 2 },
  { code: "AUD", symbol: "A$", locale: "en-AU", decimals: 2 },
  { code: "CAD", symbol: "C$", locale: "en-CA", decimals: 2 },
  { code: "INR", symbol: "₹",  locale: "en-IN", decimals: 2 },
  { code: "BRL", symbol: "R$", locale: "pt-BR", decimals: 2 },
];

const CURRENCY_BY_CODE: Record<CurrencyCode, CurrencyMeta> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c]),
) as Record<CurrencyCode, CurrencyMeta>;

export function getCurrencyMeta(code: CurrencyCode | undefined): CurrencyMeta {
  return CURRENCY_BY_CODE[code ?? "USD"] ?? CURRENCY_BY_CODE.USD;
}

// ── Rate fetching (server-side) ─────────────────────────────────────────────

interface RateBundle {
  /** key = currency code, value = USD-to-X multiplier (e.g. GBP: 0.79) */
  rates:     Record<string, number>;
  /** unix seconds when these rates were fetched */
  fetchedAt: number;
}

const RATE_CACHE_KEY = "vestream:fx:rates";
const RATE_TTL_SECONDS = 3600; // 1 hour
const RATE_STALE_TOLERANCE = 86400; // serve up to 24h stale on fetch failure

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return Redis.fromEnv();
}

/**
 * Fetch (or read from cache) the current USD-anchored FX rates for every
 * supported currency. Always returns a usable bundle:
 *   - cache hit: return cached value
 *   - cache miss: fetch fresh, store, return
 *   - cache miss + provider down + stale-but-not-too-stale: return stale
 *   - everything failed: return identity rates (1.0 for every currency,
 *     i.e. "show as if it were USD" so the page renders rather than empty)
 */
/** Identity rates (1.0 for every currency) — "show as if USD". The safe
 *  fallback when FX can't be fetched, and what callers should hand a
 *  withTimeout() guard so a stalled FX fetch can't hang the render. */
export function identityRateBundle(): RateBundle {
  return {
    rates:     Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, 1])),
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

export async function getRates(): Promise<RateBundle> {
  const fallback: RateBundle = identityRateBundle();

  const redis = getRedis();
  if (!redis) {
    // No cache available — try a direct fetch each time. Acceptable for dev.
    const fresh = await fetchFreshRates();
    return fresh ?? fallback;
  }

  const cached = await redis.get<RateBundle>(RATE_CACHE_KEY);
  const nowSec = Math.floor(Date.now() / 1000);

  if (cached && nowSec - cached.fetchedAt < RATE_TTL_SECONDS) {
    return cached;
  }

  const fresh = await fetchFreshRates();
  if (fresh) {
    await redis.set(RATE_CACHE_KEY, fresh, { ex: RATE_TTL_SECONDS * 2 });
    return fresh;
  }

  // Fetch failed. Use stale rates if available + recent enough.
  if (cached && nowSec - cached.fetchedAt < RATE_STALE_TOLERANCE) {
    return cached;
  }

  return fallback;
}

async function fetchFreshRates(): Promise<RateBundle | null> {
  // exchangerate.host: free, no API key. Returns JSON like
  // { base: "USD", rates: { GBP: 0.79, EUR: 0.93, ... } }
  const symbols = SUPPORTED_CURRENCIES.map((c) => c.code).join(",");
  try {
    const res = await fetch(
      `https://api.exchangerate.host/latest?base=USD&symbols=${symbols}`,
      { signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    if (!data.rates || typeof data.rates !== "object") return null;
    return {
      rates:     { USD: 1, ...data.rates },
      fetchedAt: Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

// ── Cookie helpers (server-side) ────────────────────────────────────────────

const COOKIE_KEY = "vestream-currency";

/**
 * Server-side helper: read the cookie to get the user's chosen currency.
 * Use in server components/layouts to render in the right currency on
 * first byte (avoids hydration flash for non-USD users).
 *
 * Lives in currency.ts (not use-currency.tsx) because the latter has
 * `"use client"` at the top — which would mark every export as a Client
 * Component. Server layouts can't import server helpers from a "use
 * client" module.
 */
export function getCurrencyFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined },
): CurrencyCode {
  const v = cookieStore.get(COOKIE_KEY)?.value;
  if (!v) return "USD";
  if (SUPPORTED_CURRENCIES.some((c) => c.code === v)) return v as CurrencyCode;
  return "USD";
}

// ── Formatting (client-safe) ────────────────────────────────────────────────

/**
 * Format a USD amount as the user's chosen currency, applying the rate.
 * Intended for client-side rendering: pass the rate fetched once on
 * page load + the user's currency choice. Returns a localised string
 * (e.g. "£3,200.50" or "¥412,000").
 */
export function formatMoney(
  usd:       number | null | undefined,
  currency:  CurrencyCode,
  rate:      number,
): string {
  if (usd == null || !isFinite(usd)) return "—";
  const meta = getCurrencyMeta(currency);
  const local = usd * rate;
  return new Intl.NumberFormat(meta.locale, {
    style:               "currency",
    currency:            meta.code,
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(local);
}

/**
 * Compact variant — "£3.2K", "€1.4M". Same convention as formatUsdCompact
 * (which this should eventually replace at every call site).
 */
export function formatMoneyCompact(
  usd:      number | null | undefined,
  currency: CurrencyCode,
  rate:     number,
): string {
  if (usd == null || !isFinite(usd)) return "—";
  const meta  = getCurrencyMeta(currency);
  const local = usd * rate;
  const abs   = Math.abs(local);
  const sign  = local < 0 ? "-" : "";

  let value: string;
  if (abs >= 1_000_000_000) value = (local / 1_000_000_000).toFixed(2) + "B";
  else if (abs >= 1_000_000) value = (local / 1_000_000).toFixed(2) + "M";
  else if (abs >= 1_000)     value = (local / 1_000).toFixed(1) + "K";
  else                        value = local.toFixed(meta.decimals);

  // Strip trailing-zero compact decimals — "1.20K" → "1.2K", "1.00M" → "1M"
  if (abs >= 1_000) value = value.replace(/\.?0+([KMB])$/, "$1");

  return `${sign}${meta.symbol}${value.replace("-", "")}`;
}
