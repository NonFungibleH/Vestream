// CSV export for the dashboard explorer.
//
// Pro / Fund tier only. Receives the same URL params as the explorer page
// (?q=...&mode=...&chain=...&protocol=...&date=...) and streams a CSV
// containing every row that matched — uncapped (no 50-row Free limit).
//
// Distinct from the dashboard CSV at /dashboard which exports a user's
// portfolio with cost basis and P&L. This one exports raw market data —
// the search result that's currently on screen.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserTier, isPaidTier } from "@/lib/auth/tier";
import { getUnlocksInWindow, WINDOWS, type WindowSlug } from "@/lib/vesting/unlock-windows";
import {
  getStreamsForExplorer,
  getStreamsByRecipient,
  type StreamRow,
} from "@/lib/vesting/explorer-queries";
import { resolveEnsName } from "@/lib/ens";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { getProtocol, PROTOCOL_SLUGS } from "@/lib/protocol-constants";

export const runtime = "nodejs";

const EXPORT_LIMIT = 5000;
const EVM_ADDRESS_RE = /^0x[0-9a-f]{40}$/i;
const ENS_RE         = /\.(eth|xyz|crypto|nft)$/i;

export async function GET(req: NextRequest) {
  const tier = await getCurrentUserTier();
  if (!isPaidTier(tier)) {
    return NextResponse.json(
      { error: "CSV export is a Pro feature" },
      { status: 403 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const query     = (sp.get("q") ?? "").trim();
  const mode      = sp.get("mode") ?? "calendar";
  const dateSlug  = (sp.get("date") ?? "30-days") as WindowSlug | "all";
  const chainIds  = parseCsvNumbers(sp.get("chain"));
  const protocols = parseCsvStrings(sp.get("protocol"));
  const adapterIds = protocols.length > 0 ? expandProtocolsToAdapters(protocols) : undefined;

  const filenameStem = mode === "calendar"
    ? `vestream-calendar-${dateSlug}`
    : mode === "stream"
      ? "vestream-streams"
      : "vestream-wallet";

  let csv = "";
  if (mode === "calendar") {
    const window = dateSlug === "all"
      ? { startSec: Math.floor(Date.now() / 1000), endSec: Math.floor(Date.now() / 1000) + 5 * 365 * 86400 }
      : WINDOWS[dateSlug as WindowSlug].range();

    const result = await getUnlocksInWindow(
      window.startSec,
      window.endSec,
      EXPORT_LIMIT,
      adapterIds,
      chainIds.length > 0 ? chainIds : undefined,
    );
    csv = calendarCsv(result.groups, query);
  } else if (mode === "stream") {
    const rows = await getStreamsForExplorer({
      chainIds:    chainIds.length > 0 ? chainIds : undefined,
      adapterIds,
      tokenSymbol: query && /^[A-Z0-9$]{2,12}$/i.test(query) && !PROTOCOL_SLUGS.includes(query.toLowerCase() as typeof PROTOCOL_SLUGS[number]) ? query : undefined,
      status:      "active",
      limit:       EXPORT_LIMIT,
    });
    csv = streamCsv(rows);
  } else if (mode === "wallet") {
    let address: string | null = null;
    if (EVM_ADDRESS_RE.test(query)) address = query.toLowerCase();
    else if (ENS_RE.test(query))    address = await resolveEnsName(query);
    else if (query)                  address = query;

    const rows = address
      ? await getStreamsByRecipient(address, {
          chainIds:   chainIds.length > 0 ? chainIds : undefined,
          adapterIds,
          status:     "any",
          limit:      EXPORT_LIMIT,
        })
      : [];
    csv = walletCsv(rows, address);
  } else {
    csv = "";
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameStem}-${todayStamp()}.csv"`,
      "Cache-Control":       "private, no-cache, no-store",
    },
  });
}

// ─── Mode-specific CSV builders ────────────────────────────────────────────

function calendarCsv(groups: Awaited<ReturnType<typeof getUnlocksInWindow>>["groups"], query: string): string {
  const head = ["event_time_utc", "protocol", "chain", "token_symbol", "token_address", "amount_raw", "decimals", "wallet_count", "stream_count", "first_recipient"];
  const lines = [head.join(",")];

  let rows = groups;
  if (query && /^[A-Z0-9$]{2,12}$/i.test(query)) {
    const want = query.toLowerCase();
    rows = rows.filter((g) => (g.tokenSymbol ?? "").toLowerCase() === want);
  }

  for (const g of rows) {
    const meta = getProtocol(g.protocol);
    lines.push([
      isoFromUnix(g.eventTime),
      csvField(meta?.name ?? g.protocol),
      csvField(CHAIN_NAMES[g.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${g.chainId}`),
      csvField(g.tokenSymbol ?? ""),
      csvField(g.tokenAddress),
      csvField(g.amount ?? ""),
      g.tokenDecimals,
      g.walletCount,
      g.streamCount,
      csvField(g.recipient),
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

function streamCsv(rows: StreamRow[]): string {
  const head = ["stream_id", "protocol", "chain", "token_symbol", "token_address", "recipient", "amount_locked_raw", "decimals", "next_unlock_utc", "end_time_utc", "status"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const meta = getProtocol(r.protocol);
    lines.push([
      csvField(r.streamId),
      csvField(meta?.name ?? r.protocol),
      csvField(CHAIN_NAMES[r.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${r.chainId}`),
      csvField(r.tokenSymbol ?? ""),
      csvField(r.tokenAddress),
      csvField(r.recipient),
      csvField(r.amount ?? ""),
      r.tokenDecimals,
      r.nextUnlockTime ? isoFromUnix(r.nextUnlockTime) : "",
      isoFromUnix(r.endTime),
      r.status,
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

function walletCsv(rows: StreamRow[], address: string | null): string {
  const head = ["wallet_address", "stream_id", "protocol", "chain", "token_symbol", "token_address", "amount_locked_raw", "decimals", "next_unlock_utc", "end_time_utc", "status"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const meta = getProtocol(r.protocol);
    lines.push([
      csvField(address ?? ""),
      csvField(r.streamId),
      csvField(meta?.name ?? r.protocol),
      csvField(CHAIN_NAMES[r.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${r.chainId}`),
      csvField(r.tokenSymbol ?? ""),
      csvField(r.tokenAddress),
      csvField(r.amount ?? ""),
      r.tokenDecimals,
      r.nextUnlockTime ? isoFromUnix(r.nextUnlockTime) : "",
      isoFromUnix(r.endTime),
      r.status,
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function csvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function isoFromUnix(unix: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toISOString();
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseCsvNumbers(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

function parseCsvStrings(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function expandProtocolsToAdapters(slugs: string[]): string[] {
  const out: string[] = [];
  for (const s of slugs) {
    if (s === "uncx") out.push("uncx", "uncx-vm");
    else out.push(s);
  }
  return out;
}
