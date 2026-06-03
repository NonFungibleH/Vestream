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
  streams: VestingStream[];
}

const DAY = 86_400;
const roundDays = (s: number) => Math.max(0, Math.round(s / DAY));

function fmtDuration(days: number): string {
  if (days <= 0) return "instant";
  if (days % 365 === 0) return `${days / 365}-yr`;
  const months = Math.round(days / 30);
  return months >= 1 ? `${months}-mo` : `${days}-day`;
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
    const recipients = new Set<string>();
    for (const s of group) {
      totalLocked += BigInt(s.lockedAmount ?? "0");
      totalAmount += BigInt(s.totalAmount ?? "0");
      recipients.add(s.recipient.toLowerCase());
      if (s.nextUnlockTime && (nextUnlockTime === null || s.nextUnlockTime < nextUnlockTime)) {
        nextUnlockTime = s.nextUnlockTime;
      }
    }
    const cliffLabel = cliffOffsetDays > 0 ? ` · ${fmtDuration(cliffOffsetDays)} cliff` : "";
    rounds.push({
      key,
      protocol,
      shape: shape as "linear" | "steps",
      cliffOffsetDays,
      durationDays,
      label: `${fmtDuration(durationDays)} ${shape}${cliffLabel}`,
      recipientCount: recipients.size,
      totalLocked: totalLocked.toString(),
      totalAmount: totalAmount.toString(),
      nextUnlockTime,
      streams: group,
    });
  }

  rounds.sort((a, b) => {
    const x = BigInt(a.totalLocked);
    const y = BigInt(b.totalLocked);
    return y > x ? 1 : y < x ? -1 : 0;
  });
  return rounds;
}
