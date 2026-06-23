// /api/fx/historical
// ─────────────────────────────────────────────────────────────────────────────
// Resolves USD→<currency> FX rates for a set of dates, used by the Tax page to
// convert each claim's USD-at-receipt value into the user's chosen currency at
// the rate ON the claim date (tax-correct — not today's rate).
//
// GET /api/fx/historical?currency=GBP&dates=2025-07-15,2025-08-22
//   → { currency: "GBP", rates: { "2025-07-15": 0.781, "2025-08-22": 0.774 } }
//
// Dates that can't be resolved are omitted; the client falls back to the live
// rate for those rows. USD short-circuits to all-1. Rates are Redis-cached
// per-(date, currency) for 60 days (historical rates are immutable).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getHistoricalRatesForDates,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
} from "@/lib/currency";

export const runtime = "nodejs";
// Varies by ?currency/?dates — must not be cached across param variants.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_DATES = 1000; // a year of daily claims is ~365; generous ceiling

export async function GET(req: NextRequest) {
  // Same gate as the rest of the dashboard — the Tax page is Pro-only.
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sp           = req.nextUrl.searchParams;
  const currencyRaw  = (sp.get("currency") ?? "USD").toUpperCase();
  const currency     = SUPPORTED_CURRENCIES.some((c) => c.code === currencyRaw)
    ? (currencyRaw as CurrencyCode)
    : "USD";

  const dates = (sp.get("dates") ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, MAX_DATES);

  const rates = await getHistoricalRatesForDates(dates, currency);

  return NextResponse.json(
    { currency, rates },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
