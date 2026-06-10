// src/lib/notifications/threshold.ts
// ─────────────────────────────────────────────────────────────────────────────
// "threshold" alert trigger — notify when a stream's claimable USD value
// crosses $N. Unlike every other trigger type this is a STATE-CROSSING
// alert, not a time alert: there is no event timestamp to fire at, so it
// doesn't fit the scheduler's resolveAlertSpecs/firingTime model. The
// scheduler evaluates it as a separate branch in the per-stream loop.
//
// Everything in this module is pure (no I/O) so it's unit-testable
// without mocking the DB or the cron route. The scheduler wires the
// results into the existing dedup + channel-send machinery.
//
// This trigger intentionally makes NO assumptions about unlock schedules
// (nextUnlockTime / unlockSteps / cliffTime) — the headline use case is
// `category === "stream"` rows (Superfluid / LlamaPay continuous
// streaming), where claimable accrues per-second and countdown-style
// alerts have nothing to count down to. Only `claimableNow` and
// `tokenDecimals` are read.
// ─────────────────────────────────────────────────────────────────────────────

import type { VestingStream } from "@/lib/vesting/types";

/** Bounds for a user-supplied threshold, in whole USD. */
export const THRESHOLD_USD_MIN = 1;
export const THRESHOLD_USD_MAX = 1_000_000;

/**
 * Synthetic-dedup timestamp parameters — see thresholdDedupTimestamp().
 *
 * BASE_SEC sits in year ~3237, far beyond any real unlock/cliff/end
 * timestamp a stream could carry, so a synthetic dedup row can never
 * collide with a time-based alert's dedup row (those use real
 * firingTimes in the current era) inside hasNotificationBeenSent's
 * ±1h tolerance window.
 *
 * SPACING_SEC stretches one dollar of threshold to 10,000 seconds.
 * Thresholds are validated to whole dollars (validateThresholdUsd
 * rounds), so two DIFFERENT thresholds are always ≥10,000s apart —
 * comfortably outside the ±3,600s dedup window. A naive epoch+threshold
 * key would put $1000 and $2000 only 1,000s apart, and the window
 * would wrongly suppress the re-fire after a user raises their
 * threshold by less than $3,600.
 */
const THRESHOLD_DEDUP_BASE_SEC    = 40_000_000_000; // ≈ year 3237
const THRESHOLD_DEDUP_SPACING_SEC = 10_000;         // per whole USD

/**
 * Synthetic dedup timestamp — threshold alerts have no event time, so
 * we derive a STABLE per-(stream, threshold) key from the threshold
 * itself: BASE + threshold × SPACING seconds. Combined with the
 * (userId, streamId, unlockTimestamp) dedup table this means a given
 * (stream, threshold) crossing fires AT MOST ONCE, ever. It never
 * re-fires unless the user changes the threshold (which produces a new
 * synthetic key) — documented behaviour, not a bug: re-arming on every
 * dip below / climb above the line would spam users of continuous
 * streams whose claimable oscillates around the threshold as they claim.
 */
export function thresholdDedupTimestamp(thresholdUsd: number): Date {
  const sec =
    THRESHOLD_DEDUP_BASE_SEC +
    Math.round(thresholdUsd) * THRESHOLD_DEDUP_SPACING_SEC;
  return new Date(sec * 1000);
}

/**
 * Validate a user-supplied threshold value. Returns the canonical
 * whole-dollar threshold, or null when the value is unusable
 * (non-numeric, non-finite, or outside [1, 1,000,000]).
 *
 * Fractional values inside the bounds are rounded to the nearest
 * dollar rather than rejected — whole-dollar thresholds are also what
 * keeps the synthetic dedup keys spaced apart (see above).
 */
export function validateThresholdUsd(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < THRESHOLD_USD_MIN || value > THRESHOLD_USD_MAX) return null;
  const rounded = Math.round(value);
  // Rounding can only move the value by <0.5, so it stays in bounds.
  return rounded;
}

/**
 * Core evaluation: is this stream's claimable value at/over the line?
 *
 * Returns null when the alert CANNOT be evaluated (no usable price, bad
 * threshold, malformed claimableNow) — the caller must skip silently;
 * we never alert on unpriced claimable. Returns { fired, claimableUsd }
 * otherwise.
 *
 * BigInt-safe-enough math: claimableNow is a stringified bigint;
 * Number() conversion loses precision above 2^53 but that's fine for a
 * USD comparison.
 */
export function resolveThresholdAlert(
  stream: Pick<VestingStream, "claimableNow" | "tokenDecimals">,
  priceUsd: number | null | undefined,
  thresholdUsd: number,
): { fired: boolean; claimableUsd: number } | null {
  if (priceUsd == null || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) return null;

  let raw: bigint;
  try {
    raw = BigInt(stream.claimableNow ?? "0");
  } catch {
    return null;
  }
  if (raw < 0n) return null;

  const decimals = Number.isInteger(stream.tokenDecimals) ? stream.tokenDecimals : 18;
  const claimableUsd = (Number(raw) / 10 ** decimals) * priceUsd;
  if (!Number.isFinite(claimableUsd)) return null;

  return { fired: claimableUsd >= thresholdUsd, claimableUsd };
}

// ─── Per-stream pref plumbing ────────────────────────────────────────────────

/** The slice of a PerStreamPref the threshold trigger cares about.
 *  Mirrors the existing per-slot convention in scheduler.ts: each slot
 *  carries its own trigger config (hoursBeforeUnlock / pushTiming2 /
 *  pushTiming3 for countdowns → thresholdUsd1/2/3 for thresholds). */
export interface ThresholdPrefSlice {
  alert1Enabled?: boolean;
  alert1TriggerType?: string;
  thresholdUsd1?: number | null;
  alert2Enabled?: boolean;
  alert2TriggerType?: string;
  thresholdUsd2?: number | null;
  alert3Enabled?: boolean;
  alert3TriggerType?: string;
  thresholdUsd3?: number | null;
}

export interface ThresholdSlot {
  slot: 1 | 2 | 3;
  thresholdUsd: number;
}

/**
 * Gather the enabled, validly-configured threshold slots for one
 * stream's prefs. A slot counts only when ALL of:
 *   - its alertNEnabled flag is explicitly true (no legacy
 *     pushTiming2-implies-on path here — threshold prefs are only
 *     written by clients that know the trigger type exists), AND
 *   - its trigger type is exactly "threshold", AND
 *   - its thresholdUsdN passes validation (positive, in bounds).
 */
export function collectThresholdSlots(
  pref: ThresholdPrefSlice | undefined | null,
): ThresholdSlot[] {
  if (!pref) return [];
  const out: ThresholdSlot[] = [];
  const slots = [
    { slot: 1 as const, enabled: pref.alert1Enabled, trigger: pref.alert1TriggerType, value: pref.thresholdUsd1 },
    { slot: 2 as const, enabled: pref.alert2Enabled, trigger: pref.alert2TriggerType, value: pref.thresholdUsd2 },
    { slot: 3 as const, enabled: pref.alert3Enabled, trigger: pref.alert3TriggerType, value: pref.thresholdUsd3 },
  ];
  for (const s of slots) {
    if (s.enabled !== true) continue;
    if (s.trigger !== "threshold") continue;
    const thresholdUsd = validateThresholdUsd(s.value ?? undefined);
    if (thresholdUsd === null) continue;
    out.push({ slot: s.slot, thresholdUsd });
  }
  return out;
}

// ─── Copy ────────────────────────────────────────────────────────────────────

function fmtUsd(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/**
 * Push title + body for a threshold crossing. Matches the existing
 * renderAlertCopy tone in scheduler.ts (plain text, no emoji,
 * "${sym} on chain N — … tap to view." body shape).
 */
export function renderThresholdCopy(
  stream: Pick<VestingStream, "tokenSymbol" | "chainId">,
  thresholdUsd: number,
  claimableUsd: number,
): { title: string; body: string } {
  const sym = stream.tokenSymbol;
  return {
    title: `${sym} passed $${fmtUsd(thresholdUsd)} claimable`,
    body:  `${sym} on chain ${stream.chainId} — about $${fmtUsd(claimableUsd)} is claimable now. Tap to view.`,
  };
}

// ─── Route-side streamPrefs validation ───────────────────────────────────────

/** Trigger types the mobile prefs route accepts per alert slot. Keep in
 *  sync with AlertTriggerType in scheduler.ts. */
export const ALLOWED_TRIGGER_TYPES = new Set([
  "before-unlock",
  "vesting-start",
  "cliff",
  "stream-end",
  "claim-ready",
  "threshold",
]);

export type StreamPrefsValidation =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Validate + normalise the threshold-related fields inside a streamPrefs
 * JSONB bag before persisting it. Pure so the route logic is testable.
 *
 *   - alertNTriggerType, when present, must be in the whitelist.
 *   - thresholdUsdN, when present and non-null, must be a finite number
 *     in [1, 1,000,000] — rejected (400) otherwise, rounded to whole
 *     dollars when valid.
 *
 * Other per-stream keys pass through untouched (the bag is deliberately
 * flexible — see the schema.ts comment on streamPrefs).
 */
export function validateStreamPrefs(raw: unknown): StreamPrefsValidation {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: true, value: {} };
  }

  const out: Record<string, unknown> = {};
  for (const [streamId, prefRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!prefRaw || typeof prefRaw !== "object" || Array.isArray(prefRaw)) {
      out[streamId] = prefRaw;
      continue;
    }
    const pref: Record<string, unknown> = { ...(prefRaw as Record<string, unknown>) };

    for (const slot of [1, 2, 3] as const) {
      const triggerKey   = `alert${slot}TriggerType`;
      const thresholdKey = `thresholdUsd${slot}`;

      const trigger = pref[triggerKey];
      if (trigger != null && (typeof trigger !== "string" || !ALLOWED_TRIGGER_TYPES.has(trigger))) {
        return { ok: false, error: `Invalid ${triggerKey} for stream ${streamId}` };
      }

      const threshold = pref[thresholdKey];
      if (threshold != null) {
        const valid = validateThresholdUsd(threshold);
        if (valid === null) {
          return {
            ok: false,
            error: `${thresholdKey} must be a number between ${THRESHOLD_USD_MIN} and ${THRESHOLD_USD_MAX} for stream ${streamId}`,
          };
        }
        pref[thresholdKey] = valid;
      }
    }

    out[streamId] = pref;
  }

  return { ok: true, value: out };
}
