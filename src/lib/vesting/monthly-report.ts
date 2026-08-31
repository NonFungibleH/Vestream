// src/lib/vesting/monthly-report.ts
// ─────────────────────────────────────────────────────────────────────────────
// Monthly Token Unlock Report data layer.
//
// Powers /unlocks/report/[YYYY-MM] — a dated, citable data artifact built for
// backlinks + AI-answer citations. Because unlock events are COMPUTED from
// vesting schedules (not snapshotted), we can generate an accurate report for
// any month by querying the schedule-derived unlock window for that month's
// bounds, then pricing + aggregating. No snapshot infrastructure required.
//
// USD is priced at CURRENT market price ("at today's price"), matching the
// live /unlocks pages. Historical-at-unlock pricing is deferred (v1).
// ─────────────────────────────────────────────────────────────────────────────

import { getUnlocksInWindow, enrichGroupsWithUsd, type WindowUnlockGroup } from "./unlock-windows";
import { getProtocol } from "../protocol-constants";

export interface MonthlyReportEvent {
  symbol:    string | null;
  address:   string;
  chainId:   number;
  protocol:  string;
  eventTime: number;      // unix sec
  amount:    string | null;
  decimals:  number;
  usdValue:  number | null;
}

export interface MonthlyReportProtocol {
  protocol:   string;
  name:       string;
  eventCount: number;
  usdTotal:   number;
}

export interface MonthlyUnlockReport {
  year:        number;
  month:       number;       // 1-12
  monthLabel:  string;       // "September 2026"
  startSec:    number;
  endSec:      number;
  totalUsd:    number;       // sum of priced events (undercount, unpriced excluded)
  pricedShare: number;       // 0-1: fraction of events we could price
  eventCount:  number;
  tokenCount:  number;
  chainCount:  number;
  topEvents:   MonthlyReportEvent[];   // ranked: priced desc, then unpriced by amount
  byProtocol:  MonthlyReportProtocol[];
  isEmpty:     boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** UTC bounds for a calendar month. month is 1-12. */
export function monthBoundsSec(year: number, month: number): { startSec: number; endSec: number } {
  const startSec = Math.floor(Date.UTC(year, month - 1, 1, 0, 0, 0) / 1000);
  const endSec   = Math.floor(Date.UTC(year, month, 1, 0, 0, 0) / 1000) - 1;
  return { startSec, endSec };
}

export function emptyMonthlyReport(year: number, month: number): MonthlyUnlockReport {
  const { startSec, endSec } = monthBoundsSec(year, month);
  return {
    year, month, monthLabel: monthLabel(year, month), startSec, endSec,
    totalUsd: 0, pricedShare: 0, eventCount: 0, tokenCount: 0, chainCount: 0,
    topEvents: [], byProtocol: [], isEmpty: true,
  };
}

function protoName(id: string): string {
  return getProtocol(id)?.name ?? id;
}

// Rank: priced events first (descending by USD), then unpriced by raw amount —
// same ordering intent as the /unlocks/[range] "biggest unlocks" list.
function rankEvents(a: WindowUnlockGroup, b: WindowUnlockGroup): number {
  const au = a.usdValue ?? null, bu = b.usdValue ?? null;
  if (au !== null && bu !== null) return bu - au;
  if (au !== null) return -1;
  if (bu !== null) return 1;
  const aa = a.amount ? BigInt(a.amount) : 0n;
  const ba = b.amount ? BigInt(b.amount) : 0n;
  return aa > ba ? -1 : aa < ba ? 1 : 0;
}

/**
 * Build the monthly unlock report for (year, month). Short-circuits to an
 * empty report during `next build` (no reliable DB) — ISR fills it on the
 * first runtime request, same guard as every other DB-touching helper.
 */
export async function getMonthlyUnlockReport(
  year: number,
  month: number,
  topN = 25,
): Promise<MonthlyUnlockReport> {
  if (process.env.NEXT_PHASE === "phase-production-build") return emptyMonthlyReport(year, month);

  const { startSec, endSec } = monthBoundsSec(year, month);
  const result = await getUnlocksInWindow(startSec, endSec, 5000);
  if (result.groups.length === 0) return emptyMonthlyReport(year, month);

  // redis:false — ISR-safe (the Upstash SDK's no-store fetch hard-errors in
  // ISR routes); the DexScreener pricing inside uses next.revalidate.
  const priced = await enrichGroupsWithUsd(result.groups, { redis: false });

  const pricedCount = priced.filter((g) => g.usdValue != null).length;
  const totalUsd = priced.reduce((sum, g) => sum + (g.usdValue ?? 0), 0);

  const topEvents: MonthlyReportEvent[] = [...priced]
    .sort(rankEvents)
    .slice(0, topN)
    .map((g) => ({
      symbol:    g.tokenSymbol,
      address:   g.tokenAddress,
      chainId:   g.chainId,
      protocol:  g.protocol,
      eventTime: g.eventTime,
      amount:    g.amount,
      decimals:  g.tokenDecimals,
      usdValue:  g.usdValue ?? null,
    }));

  const protoMap = new Map<string, MonthlyReportProtocol>();
  for (const g of priced) {
    const cur = protoMap.get(g.protocol) ?? { protocol: g.protocol, name: protoName(g.protocol), eventCount: 0, usdTotal: 0 };
    cur.eventCount += 1;
    cur.usdTotal += g.usdValue ?? 0;
    protoMap.set(g.protocol, cur);
  }
  const byProtocol = [...protoMap.values()].sort((a, b) => b.usdTotal - a.usdTotal || b.eventCount - a.eventCount);

  return {
    year, month, monthLabel: monthLabel(year, month), startSec, endSec,
    totalUsd,
    pricedShare: result.groups.length ? pricedCount / result.groups.length : 0,
    eventCount:  result.stats.unlockCount || result.groups.length,
    tokenCount:  result.stats.tokenCount,
    chainCount:  result.stats.chainCount,
    topEvents,
    byProtocol,
    isEmpty:     false,
  };
}
