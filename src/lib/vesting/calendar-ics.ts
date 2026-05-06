// src/lib/vesting/calendar-ics.ts
// ─────────────────────────────────────────────────────────────────────────────
// iCal (RFC 5545) feed generator for a user's upcoming unlocks.
//
// One VEVENT per (stream × upcoming unlock event) — both the stream's
// `nextUnlockTime` and any cliff date in the future. Window: next 365 days.
//
// Used by the public /api/calendar/[token].ics endpoint. Calendar apps
// (Google Calendar, Apple Calendar, Outlook) poll this URL on their own
// schedule (typically every few hours) so the feed needs to be cheap to
// regenerate; we keep the per-user query bounded by the user's wallet
// list.
//
// Format conventions:
//   - All times in UTC (Z suffix).
//   - UID per event is stable: `vestr-{streamId}-{eventTimestamp}@vestream.io`
//     so re-fetches replace existing calendar entries instead of duplicating.
//   - VEVENTs include URL field pointing back to the dashboard so users
//     can click through from their calendar.
//   - All-day events (DURATION=PT0S → calendar app shows as zero-duration
//     "moment" event). Could change to PT1H if users want a visible block.
//
// Length-cap on output: cap at MAX_EVENTS=500 so a power-user with many
// streams doesn't generate a 10MB feed. Sorted by event time ascending,
// so the earliest 500 always make it.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { wallets, vestingStreamsCache, streamAnnotations } from "@/lib/db/schema";
import { eq, inArray, and, gt, sql } from "drizzle-orm";
import type { VestingStream } from "@/lib/vesting/types";

const MAX_EVENTS = 500;
const ONE_YEAR_SEC = 365 * 24 * 60 * 60;

interface CalendarEvent {
  uid:        string;
  startSec:   number;
  summary:    string;
  description: string;
  url:        string;
}

const PROTOCOL_LABELS: Record<string, string> = {
  sablier:        "Sablier",
  hedgey:         "Hedgey",
  uncx:           "UNCX",
  "uncx-vm":      "UNCX VM",
  unvest:         "Unvest",
  "team-finance": "Team Finance",
  superfluid:     "Superfluid",
  pinksale:       "PinkSale",
  streamflow:     "Streamflow",
  "jupiter-lock": "Jupiter Lock",
  llamapay:       "LlamaPay",
};

const CHAIN_LABELS: Record<number, string> = {
  1: "Ethereum", 56: "BNB", 137: "Polygon", 8453: "Base",
  42161: "Arbitrum", 10: "Optimism", 101: "Solana",
};

/** Format a unix-second timestamp as an RFC 5545 UTC timestamp (`YYYYMMDDTHHMMSSZ`). */
function fmtIcalTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Escape per RFC 5545 §3.3.11 — backslash, comma, semicolon, newline.
 * Cap at 200 chars per field to avoid wraps and keep file size sane.
 */
function escapeIcal(raw: string): string {
  return raw
    .slice(0, 200)
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r?\n/g, "\\n");
}

/** Format a token amount (raw bigint string + decimals) as a short
 *  human-readable number for the calendar event title. */
function fmtTokenAmount(rawAmount: string, decimals: number): string {
  try {
    const big = BigInt(rawAmount);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    if (whole >= 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(1)}M`;
    if (whole >= 1_000n)     return `${(Number(whole) / 1_000).toFixed(1)}K`;
    if (whole === 0n) {
      const frac = Number(big % divisor) / Number(divisor);
      return frac.toFixed(2);
    }
    return whole.toLocaleString("en-US");
  } catch {
    return "?";
  }
}

/**
 * Build the calendar events for one user. Pulls their tracked wallets,
 * finds active streams in the cache, and emits an event per future unlock.
 */
async function buildEvents(userId: string): Promise<CalendarEvent[]> {
  // Step 1: get the user's tracked wallets.
  const userWallets = await db
    .select({ address: wallets.address })
    .from(wallets)
    .where(eq(wallets.userId, userId));

  if (userWallets.length === 0) return [];

  const addrs = userWallets.map((w) => w.address.toLowerCase());

  // Step 2: pull active streams for those wallets, ordered by endTime asc.
  // Cap at 5000 like the unlock-windows query — covers any realistic user.
  const nowSec = Math.floor(Date.now() / 1000);
  const horizonSec = nowSec + ONE_YEAR_SEC;

  const rows = await db
    .select({
      streamId:    vestingStreamsCache.streamId,
      protocol:    vestingStreamsCache.protocol,
      chainId:     vestingStreamsCache.chainId,
      tokenSymbol: vestingStreamsCache.tokenSymbol,
      streamData:  vestingStreamsCache.streamData,
      endTime:     vestingStreamsCache.endTime,
    })
    .from(vestingStreamsCache)
    .where(and(
      inArray(sql`lower(${vestingStreamsCache.recipient})`, addrs),
      eq(vestingStreamsCache.isFullyVested, false),
    ))
    .limit(5000);

  // Step 3: pull annotations for those streams so the calendar event can
  // use the user's custom name when set (more useful than the auto label).
  const streamIds = rows.map((r) => r.streamId);
  const annotations = streamIds.length > 0
    ? await db
        .select({
          streamId:   streamAnnotations.streamId,
          customName: streamAnnotations.customName,
        })
        .from(streamAnnotations)
        .where(and(
          eq(streamAnnotations.userId, userId),
          inArray(streamAnnotations.streamId, streamIds),
        ))
    : [];
  const customNameByStreamId = new Map(annotations.map((a) => [a.streamId, a.customName]));

  // Step 4: synthesise events. For each stream:
  //   • If nextUnlockTime is in the future and < horizon → one event there
  //   • If cliffTime is in the future and < horizon → one event there
  //   • If endTime is in the future and < horizon AND no nextUnlock above → fallback event at end
  // Dedupe (uid is unique per stream × time so duplicates auto-drop).
  const events: CalendarEvent[] = [];
  for (const r of rows) {
    const sd = (r.streamData ?? {}) as Partial<VestingStream> & { unlockSteps?: Array<{ timestamp: number; amount: string }> };
    const protoLabel = PROTOCOL_LABELS[r.protocol] ?? r.protocol;
    const chainLabel = CHAIN_LABELS[r.chainId] ?? `chain ${r.chainId}`;
    const customName = customNameByStreamId.get(r.streamId);
    const tokenSymbol = r.tokenSymbol ?? "TOKEN";

    const dashboardUrl = `https://vestream.io/dashboard`;

    // Cliff event (if cliff is upcoming).
    if (typeof sd.cliffTime === "number" && sd.cliffTime > nowSec && sd.cliffTime < horizonSec) {
      const titleBase = customName ?? `${tokenSymbol} cliff`;
      events.push({
        uid:        `vestr-${r.streamId}-cliff-${sd.cliffTime}@vestream.io`,
        startSec:   sd.cliffTime,
        summary:    `🔒 ${titleBase} (${protoLabel} cliff)`,
        description: `${tokenSymbol} cliff on ${protoLabel} · ${chainLabel}. Stream ${r.streamId}.`,
        url:        dashboardUrl,
      });
    }

    // Next-unlock event.
    if (typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > nowSec && sd.nextUnlockTime < horizonSec) {
      const titleBase = customName ?? `${tokenSymbol} unlock`;
      // For step-shaped streams, look up the matching step amount for a
      // richer title ("USDC unlock — 1,000").
      let amountSuffix = "";
      if (Array.isArray(sd.unlockSteps)) {
        const matchingStep = sd.unlockSteps.find((s) => s.timestamp === sd.nextUnlockTime);
        if (matchingStep) {
          const dec = sd.tokenDecimals ?? 18;
          amountSuffix = ` — ${fmtTokenAmount(matchingStep.amount, dec)} ${tokenSymbol}`;
        }
      }
      events.push({
        uid:        `vestr-${r.streamId}-unlock-${sd.nextUnlockTime}@vestream.io`,
        startSec:   sd.nextUnlockTime,
        summary:    `${titleBase}${amountSuffix} (${protoLabel})`,
        description: `${tokenSymbol} unlock on ${protoLabel} · ${chainLabel}. Stream ${r.streamId}.`,
        url:        dashboardUrl,
      });
    }

    // Final-end event — only if we don't already have a nextUnlock for this
    // stream (otherwise the end IS the nextUnlock, no double event).
    const hasNextUnlock = typeof sd.nextUnlockTime === "number" && sd.nextUnlockTime > nowSec;
    if (!hasNextUnlock && r.endTime !== null && r.endTime > nowSec && r.endTime < horizonSec) {
      const titleBase = customName ?? `${tokenSymbol} fully vested`;
      events.push({
        uid:        `vestr-${r.streamId}-end-${r.endTime}@vestream.io`,
        startSec:   Number(r.endTime),
        summary:    `🎯 ${titleBase} (${protoLabel} ends)`,
        description: `${tokenSymbol} stream ends on ${protoLabel} · ${chainLabel}. Stream ${r.streamId}.`,
        url:        dashboardUrl,
      });
    }
  }

  // Sort by start time, then truncate to MAX_EVENTS. Earliest get to ship.
  events.sort((a, b) => a.startSec - b.startSec);
  return events.slice(0, MAX_EVENTS);
}

/**
 * Generate the iCal payload string for a user. Returns a complete
 * VCALENDAR-wrapped feed ready to serve as `text/calendar`.
 */
export async function generateCalendarFeed(userId: string): Promise<string> {
  const events = await buildEvents(userId);
  const stamp = fmtIcalTime(Math.floor(Date.now() / 1000));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TokenVest//Token Vesting Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TokenVest — Token unlocks",
    "X-WR-CALDESC:Upcoming token vesting unlocks for your tracked wallets.",
    "X-WR-TIMEZONE:UTC",
    // Refresh hint — Apple Calendar respects this; Google ignores but
    // does its own ~24h polling regardless.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];

  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${fmtIcalTime(ev.startSec)}`,
      // Zero-duration: shows as a moment in the calendar (a single point on
      // the day), not a blocking time slot. Less intrusive than an hour-long
      // event for what is logically a notification, not a meeting.
      `DURATION:PT0S`,
      `SUMMARY:${escapeIcal(ev.summary)}`,
      `DESCRIPTION:${escapeIcal(ev.description)}`,
      `URL:${ev.url}`,
      `STATUS:CONFIRMED`,
      `TRANSP:TRANSPARENT`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 line endings are CRLF, and lines should be ≤ 75 octets
  // (folded). We don't fold — most calendar apps accept long lines, and
  // our content stays under 200 chars per line via the slice() in escapeIcal.
  return lines.join("\r\n") + "\r\n";
}
