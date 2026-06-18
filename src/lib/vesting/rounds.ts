// ─────────────────────────────────────────────────────────────────────────────
// Group a token's individual vesting streams into "rounds".
//
// A token usually has many streams (one per recipient). Chain data has no
// "Seed / Team / Investor" label, so we infer rounds from the vesting TERMS:
// streams that share protocol + shape + cliff-offset + duration were almost
// always created as one batch (a round). Each round is labelled by its terms
// (e.g. "24-mo linear · 6-mo cliff") and lists the wallets receiving tokens.
//
// v1 deliberately does NOT bucket by start date — two batches with identical
// terms created months apart merge into one round. Acceptable tradeoff; add a
// start-month term here if it proves too coarse.
// ─────────────────────────────────────────────────────────────────────────────

import type { VestingStream } from "./types";

export interface Round {
  key: string;
  protocol: string;
  shape: "linear" | "steps";
  cliffOffsetDays: number;
  durationDays: number;
  label: string;            // e.g. "24-mo linear · 6-mo cliff"
  recipientCount: number;
  totalLocked: string;      // stringified bigint (sum of lockedAmount)
  totalAmount: string;      // stringified bigint (sum of totalAmount)
  nextUnlockTime: number | null;
  /** Earliest start and latest end across the round's streams. When these
   *  differ the round is a STAGGERED cohort (e.g. 84 instant unlocks each on
   *  its own date) — the UI shows this window as a range instead of a single
   *  misleading "next" date. */
  windowStart: number;
  windowEnd: number;
  streams: VestingStream[];
}

const DAY = 86_400;
const roundDays = (s: number) => Math.max(0, Math.round(s / DAY));

// Human-readable duration. Years for anything ≥ 2 years (so an 8-year lock
// reads "8.2 yr" not "99-mo"), months below that, days for sub-month. One
// decimal on years unless within ~5% of a whole year.
function fmtDuration(days: number): string {
  if (days <= 0) return "instant";
  const months = Math.round(days / 30.44);
  if (months >= 24) {
    const years = days / 365.25;
    const rounded = Math.round(years);
    return Math.abs(years - rounded) < 0.08 ? `${rounded} yr` : `${years.toFixed(1)} yr`;
  }
  if (months >= 1) return `${months} mo`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function groupIntoRounds(streams: VestingStream[]): Round[] {
  const map = new Map<string, VestingStream[]>();
  for (const s of streams) {
    const shape = s.shape === "steps" ? "steps" : "linear";
    const cliffOffset = roundDays((s.cliffTime ?? s.startTime) - s.startTime);
    const duration = roundDays(s.endTime - s.startTime);
    const key = `${s.protocol}|${shape}|${cliffOffset}|${duration}`;
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }

  const rounds: Round[] = [];
  for (const [key, group] of map) {
    const [protocol, shape, cliffStr, durStr] = key.split("|");
    const cliffOffsetDays = Number(cliffStr);
    const durationDays = Number(durStr);
    let totalLocked = 0n;
    let totalAmount = 0n;
    let nextUnlockTime: number | null = null;
    let windowStart = Infinity;
    let windowEnd = -Infinity;
    const recipients = new Set<string>();
    for (const s of group) {
      totalLocked += BigInt(s.lockedAmount ?? "0");
      totalAmount += BigInt(s.totalAmount ?? "0");
      recipients.add(s.recipient.toLowerCase());
      if (s.nextUnlockTime && (nextUnlockTime === null || s.nextUnlockTime < nextUnlockTime)) {
        nextUnlockTime = s.nextUnlockTime;
      }
      if (s.startTime && s.startTime < windowStart) windowStart = s.startTime;
      if (s.endTime && s.endTime > windowEnd) windowEnd = s.endTime;
    }
    if (!Number.isFinite(windowStart)) windowStart = 0;
    if (!Number.isFinite(windowEnd)) windowEnd = 0;
    // Label by terms, picking the clearest phrasing for each shape:
    //  - Instant (duration 0): start == end, the whole allocation releases in
    //    one lump on a single date. "Linear · instant" is a contradiction —
    //    call it "Instant unlock". (When many such streams have DIFFERENT dates
    //    they still group here by terms; the UI shows the date RANGE so a
    //    staggered cohort reads as a window, not one date.)
    //  - Cliff-only: cliff at/after the end → one lump at the cliff.
    //  - Otherwise: Linear / Stepped over the duration (+ cliff if any).
    const isInstant   = durationDays === 0;
    const isCliffOnly = durationDays > 0 && cliffOffsetDays >= durationDays - 3;
    const label = isInstant
      ? "Instant unlock"
      : isCliffOnly
        ? `Cliff unlock · ${fmtDuration(durationDays)}`
        : `${shape === "steps" ? "Stepped" : "Linear"} · ${fmtDuration(durationDays)}`
          + (cliffOffsetDays > 0 ? ` · ${fmtDuration(cliffOffsetDays)} cliff` : "");
    rounds.push({
      key,
      protocol,
      shape: shape as "linear" | "steps",
      cliffOffsetDays,
      durationDays,
      label,
      recipientCount: recipients.size,
      totalLocked: totalLocked.toString(),
      totalAmount: totalAmount.toString(),
      nextUnlockTime,
      windowStart,
      windowEnd,
      streams: group,
    });
  }

  // Chronological by next unlock — a vesting schedule reads as a TIMELINE, so
  // ordering by date (not allocation size) is what users expect when they scan
  // "when do unlocks happen". Rounds with no upcoming unlock sort last; ties
  // break by larger allocation first.
  rounds.sort((a, b) => {
    const an = a.nextUnlockTime ?? Infinity;
    const bn = b.nextUnlockTime ?? Infinity;
    if (an !== bn) return an - bn;
    const x = BigInt(a.totalLocked);
    const y = BigInt(b.totalLocked);
    return y > x ? 1 : y < x ? -1 : 0;
  });
  return rounds;
}
