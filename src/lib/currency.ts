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
// FX provider: Frankfurter (api.frankfurter.dev) — free, no API key, ECB
// reference rates, supports both latest and dated-historical lookups.
// (Migrated off exchangerate.host 2026-06 when it began requiring an access
// key on every endpoint.) Live rates cached 1h; on fetch failure we serve
// stale rather than show "—".
//
// Historical rates (getHistoricalRatesForDates, below) power the tax surfaces:
// a UK self-assessment requires GBP at receipt, not GBP at today's rate, so
// each claim is converted at the rate ON its claim date.
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
  // Frankfurter (ECB reference rates): free, no API key. Returns JSON like
  // { amount: 1, base: "USD", date: "...", rates: { GBP: 0.79, EUR: 0.93 } }.
  // Replaced exchangerate.host 2026-06 after it began requiring an access key
  // on every endpoint — which had silently degraded live FX to identity rates.
  const symbols = SUPPORTED_CURRENCIES.filter((c) => c.code !== "USD").map((c) => c.code).join(",");
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`,
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

// ── Historical FX (server-side) ─────────────────────────────────────────────
//
// Tax surfaces need the USD→local rate AT THE DATE OF EACH EVENT, not today's
// rate — a UK self-assessment wants GBP at receipt, an IRS filing wants USD
// basis but a non-USD résident wants their local value on the income date.
// (See the module header.) These helpers fetch dated rates and cache them
// hard: a historical rate for 2025-07-15 never changes, so the cache key is
// per-(date, currency) with a long TTL.

const HIST_RATE_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days — historical rates are immutable
const HIST_FETCH_CONCURRENCY = 8;

/** Fetch one day's USD→currency rate from Frankfurter's dated endpoint.
 *  Returns null on any failure so the caller can fall back to a live rate.
 *  Frankfurter serves ECB rates; for a weekend/holiday date it returns the
 *  nearest prior business day's rate — which is exactly the rate that applies
 *  for a claim received that day. */
async function fetchHistoricalRate(date: string, currency: CurrencyCode): Promise<number | null> {
  // Frankfurter historical form: /v1/YYYY-MM-DD?base=USD&symbols=GBP
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=${currency}`,
      { signal: AbortSignal.timeout(4_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    const rate = data.rates?.[currency];
    return typeof rate === "number" && isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Resolve USD→`currency` rates for a set of claim/event dates (YYYY-MM-DD).
 * USD short-circuits to all-1. Each date is Redis-cached per-(date, currency)
 * with a 60-day TTL (historical rates don't move). Misses are fetched in
 * bounded-concurrency batches; a date that can't be resolved is simply
 * omitted from the result map — the caller falls back to its live rate.
 */
export async function getHistoricalRatesForDates(
  dates:    string[],
  currency: CurrencyCode,
): Promise<Record<string, number>> {
  const unique = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (currency === "USD") {
    return Object.fromEntries(unique.map((d) => [d, 1]));
  }

  const redis  = getRedis();
  const result: Record<string, number> = {};
  const misses: string[] = [];

  // Pass 1 — read cache.
  if (redis) {
    const keys = unique.map((d) => `vestream:fx:hist:${d}:${currency}`);
    const cached = keys.length ? await redis.mget<number[]>(...keys) : [];
    unique.forEach((d, i) => {
      const v = cached[i];
      if (typeof v === "number" && isFinite(v) && v > 0) result[d] = v;
      else misses.push(d);
    });
  } else {
    misses.push(...unique);
  }

  // Pass 2 — fetch the misses in bounded-concurrency batches.
  for (let i = 0; i < misses.length; i += HIST_FETCH_CONCURRENCY) {
    const batch = misses.slice(i, i + HIST_FETCH_CONCURRENCY);
    const rates = await Promise.all(batch.map((d) => fetchHistoricalRate(d, currency)));
    await Promise.all(batch.map(async (d, j) => {
      const rate = rates[j];
      if (rate == null) return; // unresolved — omit, caller uses live fallback
      result[d] = rate;
      if (redis) {
        try { await redis.set(`vestream:fx:hist:${d}:${currency}`, rate, { ex: HIST_RATE_TTL_SECONDS }); }
        catch { /* cache write best-effort */ }
      }
    }));
  }

  return result;
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
