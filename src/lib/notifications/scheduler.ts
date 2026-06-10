import { readFromCache } from "@/lib/vesting/dbcache";
import { sendEmailNotification } from "./email";
import { sendExpoPush } from "./push";
import {
  getAllUsersWithAnyAlertEnabled,
  getWalletsForUser,
  hasNotificationBeenSent,
  recordNotificationSent,
  checkAndConsumePushCredit,
} from "@/lib/db/queries";
import { mapBounded } from "@/lib/vesting/rpc";
import type { VestingStream } from "@/lib/vesting/types";
import { readPriceCache } from "@/lib/vesting/token-price-cache";
import {
  collectThresholdSlots,
  resolveThresholdAlert,
  renderThresholdCopy,
  thresholdDedupTimestamp,
} from "./threshold";

type AlertTriggerType =
  | "before-unlock"
  | "vesting-start"
  | "cliff"
  | "stream-end"
  | "claim-ready"   // legacy; functionally same as before-unlock @ 0h
  | "threshold";    // state-crossing: claimable USD value passed $N (2026-06)

interface PerStreamPref {
  enabled?: boolean;
  alert1Enabled?: boolean;
  alert1TriggerType?: AlertTriggerType;
  hoursBeforeUnlock?: number | null;
  pushTiming2?: number | null;
  alert2Enabled?: boolean;
  alert2TriggerType?: AlertTriggerType;
  // 2026-05-20: Alert 3 slot added.
  alert3Enabled?: boolean;
  alert3TriggerType?: AlertTriggerType;
  pushTiming3?: number | null;
  // 2026-06: per-slot USD thresholds for the "threshold" trigger type.
  // Mirrors the per-slot timing convention (hoursBeforeUnlock /
  // pushTiming2 / pushTiming3) — slot N reads thresholdUsdN.
  thresholdUsd1?: number | null;
  thresholdUsd2?: number | null;
  thresholdUsd3?: number | null;
}

/**
 * Resolved spec for ONE per-stream alert slot the scheduler is about
 * to evaluate. The split between `firingTime` and `eventTime` matters
 * because the dedup key uses `firingTime` (so two alerts on the same
 * stream that fire at different real-world moments don't suppress each
 * other), but the user-facing copy references the underlying
 * `eventTime` ("unlocks in 2h", "cliff reached", etc.).
 */
interface AlertSpec {
  slot: 1 | 2 | 3;
  /** "threshold" is excluded — it's a state-crossing alert with no
   *  firingTime, evaluated in its own branch of the per-stream loop. */
  triggerType: Exclude<AlertTriggerType, "threshold">;
  /** When in real time the push should sound (unix seconds). */
  firingTime: number;
  /** When in the stream's lifecycle the alert references (unix seconds). */
  eventTime: number;
  /** For "before-unlock" — hours-before value used in the body copy. */
  hoursBefore?: number;
}

/**
 * 2026-05-20: scheduler restructured to support per-stream event
 * triggers. Previously a stream could only have ONE alert ("notify me
 * N hours before next unlock"); now each stream supports two
 * independently-configured alerts (Alert 1 + Alert 2), and each alert
 * can fire on EITHER a countdown timing OR a vesting-lifecycle event:
 *
 *   - "before-unlock"  — fire N hours before stream.nextUnlockTime
 *   - "cliff"          — fire when stream.cliffTime is reached
 *   - "stream-end"     — fire when stream.endTime is reached
 *   - "claim-ready"    — fire at the moment the next unlock makes
 *                        tokens claimable (= nextUnlockTime itself)
 *
 * The two slots are evaluated independently per loop iteration, so
 * alert1 firing 24h before and alert2 firing 1h before BOTH fire
 * (their dedup keys are distinct because they're computed off
 * firingTime, not eventTime).
 *
 * Per-channel gates (server-side truth) unchanged:
 *   - email: emailEnabled = true AND tier = "pro" AND email is set
 *   - push:  expoPushToken is set AND checkAndConsumePushCredit allows
 *
 * Dedupe key continues to be (userId, streamId, unlockDate) on the
 * `notifications_sent` table — `unlockDate` here is the firingTime
 * for the slot (not the underlying event time). Two alerts on the
 * same stream at different firing moments get different dedup rows.
 * The existing ±1h tolerance window inside hasNotificationBeenSent
 * still prevents a re-fire from a subsequent cron tick within the
 * same window.
 *
 * Back-compat: a stream pref with no `alert1TriggerType` (older
 * mobile build) is treated as "before-unlock", preserving existing
 * behaviour. Same for `alert2TriggerType`.
 */
export async function runNotificationJob(): Promise<number> {
  const nowSec = Math.floor(Date.now() / 1000);

  // Slop windows. Tuned for the 15-minute cron cadence.
  // - PAST_GRACE_SEC=3600 lets a cron tick that fires up to 1h after
  //   an event still send (the dedup table prevents re-firing).
  // - FUTURE_SLOP_SEC=300 lets the "fire at event" triggers (claim-ready,
  //   live-unlock) catch the tick that lands within 5 minutes of the event.
  const PAST_GRACE_SEC  = 3600;
  const FUTURE_SLOP_SEC = 300;

  const usersToNotify = await getAllUsersWithAnyAlertEnabled();

  // Process up to 8 users in parallel. Each user's work is:
  //   1 DB query (readFromCache) + dedup checks + email/push sends.
  // Previously this was a serial for-loop calling aggregateVestingStreams()
  // (20+ external API calls per user). readFromCache is a single SQL query,
  // so the bottleneck is now push/email I/O — safe to fan out.
  const notifiedCounts = await mapBounded(
    usersToNotify,
    8,
    async ({
      userId, email, hoursBeforeUnlock,
      emailEnabled, streamPrefs, tier, expoPushToken, timezone,
    }) => {
      let userNotifiedCount = 0;

      const walletRows = await getWalletsForUser(userId);
      if (walletRows.length === 0) return 0;

      const addresses = walletRows.map((w) => w.address);

      // Read from the pre-seeded DB cache (updated every 2h by the
      // seed-cache cron). Avoids 20+ live adapter calls per user that
      // previously caused the notify cron to hit the 300s Vercel limit.
      // 2h-stale stream data is accurate enough for unlock notifications.
      let streams: VestingStream[];
      try {
        const cacheResult = await readFromCache(addresses);
        streams = cacheResult.streams;
      } catch (err) {
        console.error(`Failed to read cache for user ${userId}:`, err);
        return 0;
      }

      const canEmail = emailEnabled && tier === "pro" && !!email;
      const canPush  = !!expoPushToken;
      if (!canEmail && !canPush) return 0;

      const prefsMap = (streamPrefs ?? {}) as Record<string, PerStreamPref>;

      // ── Threshold-alert price pre-pass ──────────────────────────────
      // "threshold" slots need a CURRENT USD price. Collect the token
      // keys for every stream carrying an enabled threshold slot and
      // bulk-read the token_prices_cache table once per user — a single
      // SQL query against a cache the hourly refresh-prices cron keeps
      // warm. No external price API is ever called from this cron.
      // Streams whose token has no fresh cached price simply don't get
      // a price-map entry and are skipped silently below.
      const thresholdPriceKeys = streams
        .filter((s) => collectThresholdSlots(prefsMap[s.id]).length > 0)
        .map((s) => ({ chainId: s.chainId, tokenAddress: s.tokenAddress }));
      const thresholdPrices = thresholdPriceKeys.length > 0
        ? await readPriceCache(thresholdPriceKeys)
        : null;

      for (const stream of streams) {
        // Per-stream opt-in is REQUIRED. A user who never visited the
        // Alerts tab for this token gets nothing — see the 2026-05-20
        // privacy fix comment in the earlier scheduler version.
        const perStream = prefsMap[stream.id];
        if (!perStream) continue;

        // Gather the alert specs for this stream — up to 3 per stream.
        const alertSpecs: AlertSpec[] = [];

        // "threshold" slots are state-crossing alerts (claimable USD
        // passed $N) with no firingTime, so they don't become
        // AlertSpecs — they're gathered here and evaluated in their
        // own branch after the time-based loop below. The slot blocks
        // skip them so they never reach resolveAlertSpecs.
        const thresholdSlots = collectThresholdSlots(perStream);

        // ── Alert 1 ──
        if (perStream.alert1Enabled === true) {
          const triggerType = perStream.alert1TriggerType ?? "before-unlock";
          if (triggerType !== "threshold") {
            alertSpecs.push(
              ...resolveAlertSpecs(
                1,
                triggerType,
                perStream.hoursBeforeUnlock ?? hoursBeforeUnlock,
                stream,
                nowSec,
              ),
            );
          }
        }

        // ── Alert 2 ──
        // Two paths to "on": new explicit alert2Enabled flag (event-type
        // Alert 2 — no timing number) OR legacy pushTiming2 != null
        // (countdown Alert 2 written by older mobile clients).
        const alert2On =
          perStream.alert2Enabled === true || perStream.pushTiming2 != null;
        if (alert2On) {
          const triggerType: AlertTriggerType =
            perStream.alert2TriggerType ?? "before-unlock";
          if (triggerType !== "threshold") {
            const hoursBefore =
              triggerType === "before-unlock"
                ? (perStream.pushTiming2 ?? 1)
                : 0;
            alertSpecs.push(...resolveAlertSpecs(2, triggerType, hoursBefore, stream, nowSec));
          }
        }

        // ── Alert 3 ──
        if (perStream.alert3Enabled === true) {
          const triggerType: AlertTriggerType =
            perStream.alert3TriggerType ?? "before-unlock";
          if (triggerType !== "threshold") {
            const hoursBefore =
              triggerType === "before-unlock"
                ? (perStream.pushTiming3 ?? 0)
                : 0;
            alertSpecs.push(...resolveAlertSpecs(3, triggerType, hoursBefore, stream, nowSec));
          }
        }

        if (alertSpecs.length === 0 && thresholdSlots.length === 0) continue;

        // Evaluate each alert independently. One slot firing doesn't
        // block the other — they have different firingTimes and
        // independent dedup rows.
        for (const spec of alertSpecs) {
          const delta = spec.firingTime - nowSec;
          if (delta > FUTURE_SLOP_SEC) continue;        // too early
          if (delta < -PAST_GRACE_SEC) continue;        // too late

          const dedupDate = new Date(spec.firingTime * 1000);
          const alreadySent = await hasNotificationBeenSent(userId, stream.id, dedupDate);
          if (alreadySent) continue;

          // Copy varies by trigger type so the push body reads correctly.
          const { title, body } = renderAlertCopy(spec, stream, nowSec);

          let sentSomething = false;
          try {
            // ── Email channel ──
            if (canEmail && email) {
              try {
                await sendEmailNotification(
                  email,
                  stream,
                  new Date(spec.eventTime * 1000),
                  { trigger: spec.triggerType, timezone },
                );
                sentSomething = true;
              } catch (err) {
                console.error(`Email send failed for user ${userId}:`, err);
              }
            }

            // ── Push channel ──
            // Free tier metered (10/month); Pro unmetered.
            if (canPush && expoPushToken) {
              const credit = await checkAndConsumePushCredit(userId);
              if (credit.allowed) {
                const result = await sendExpoPush({
                  to:    expoPushToken,
                  title,
                  body,
                  data:  { streamId: stream.id, url: `/stream/${stream.id}` },
                }).catch((err) => {
                  console.error(`Push send failed for user ${userId}:`, err);
                  return { ok: false, error: "send failed" } as const;
                });
                if (result.ok) sentSomething = true;
              }
            }

            // Only record if at least one channel actually fired —
            // otherwise a transient email outage that left push for
            // retry next tick would prematurely dedupe.
            if (sentSomething) {
              await recordNotificationSent(userId, stream.id, dedupDate);
              userNotifiedCount++;
            }
          } catch (err) {
            console.error(`Failed to send notification for stream ${stream.id} slot ${spec.slot}:`, err);
          }
        }

        // ── Threshold alerts (state-crossing — no firingTime) ────────
        // Works for ANY stream shape, including `category === "stream"`
        // rows (Superfluid / LlamaPay continuous streams) whose
        // countdown alerts have nothing to count down to: only
        // claimableNow + tokenDecimals are read, never nextUnlockTime /
        // unlockSteps.
        for (const tSlot of thresholdSlots) {
          const price = thresholdPrices?.get(
            `${stream.chainId}:${stream.tokenAddress.toLowerCase()}`,
          );
          // No usable cached price → resolveThresholdAlert returns null
          // and we skip silently. Never alert on unpriced claimable.
          const resolved = resolveThresholdAlert(stream, price?.priceUsd, tSlot.thresholdUsd);
          if (!resolved || !resolved.fired) continue;

          // Synthetic dedup timestamp — threshold alerts have no event
          // time, so the key is derived from the threshold itself (see
          // thresholdDedupTimestamp). Stable per (stream, threshold):
          // the crossing fires AT MOST ONCE and never re-fires unless
          // the user changes the threshold (new synthetic key).
          const dedupDate = thresholdDedupTimestamp(tSlot.thresholdUsd);
          const alreadySent = await hasNotificationBeenSent(userId, stream.id, dedupDate);
          if (alreadySent) continue;

          const { title, body } = renderThresholdCopy(
            stream, tSlot.thresholdUsd, resolved.claimableUsd,
          );

          let sentSomething = false;
          try {
            // ── Email channel ── (same Pro-only gate as other alerts)
            if (canEmail && email) {
              try {
                await sendEmailNotification(
                  email,
                  stream,
                  new Date(nowSec * 1000), // crossing observed "now"
                  {
                    trigger:      "threshold",
                    timezone,
                    thresholdUsd: tSlot.thresholdUsd,
                    claimableUsd: resolved.claimableUsd,
                  },
                );
                sentSomething = true;
              } catch (err) {
                console.error(`Email send failed for user ${userId}:`, err);
              }
            }

            // ── Push channel ── (same token + credit gates)
            if (canPush && expoPushToken) {
              const credit = await checkAndConsumePushCredit(userId);
              if (credit.allowed) {
                const result = await sendExpoPush({
                  to:    expoPushToken,
                  title,
                  body,
                  data:  { streamId: stream.id, url: `/stream/${stream.id}` },
                }).catch((err) => {
                  console.error(`Push send failed for user ${userId}:`, err);
                  return { ok: false, error: "send failed" } as const;
                });
                if (result.ok) sentSomething = true;
              }
            }

            // Same record-only-on-success rule as time-based alerts.
            if (sentSomething) {
              await recordNotificationSent(userId, stream.id, dedupDate);
              userNotifiedCount++;
            }
          } catch (err) {
            console.error(`Failed to send threshold notification for stream ${stream.id} slot ${tSlot.slot}:`, err);
          }
        }
      }

      return userNotifiedCount;
    },
  );

  return notifiedCounts.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
    0,
  );
}

/**
 * Build the concrete firing specs for one alert slot, given the
 * trigger type the user picked and the stream's lifecycle timestamps.
 *
 * Returns an ARRAY (not a single spec) because the "before-unlock"
 * trigger can fan out across multiple upcoming unlock steps for a
 * stream with a discrete unlock schedule (tranched / cycle vesting).
 * Event-type triggers always return a 0- or 1-element array.
 *
 * 2026-05-20 recurring/multi-unlock change:
 *   - For "before-unlock" triggers, when `stream.unlockSteps[]` is
 *     present we emit one spec per upcoming step within a horizon
 *     of `LOOKAHEAD_SEC` from now. Combined with the caller's
 *     per-spec dedup check, this means a user who set "24h before
 *     unlock" on a monthly-tranche stream will get one push per
 *     month for the duration of the schedule — without having to
 *     touch the Alerts tab again.
 *   - For linear streams (no unlockSteps), we fall back to the
 *     single `stream.nextUnlockTime`, matching the pre-recurring
 *     behaviour exactly.
 *
 * LOOKAHEAD_SEC bounds how far forward we project. A horizon of
 * 14 days covers the most common cron cadence (5 min ticks) with
 * room to absorb a few skipped runs without missing imminent unlocks.
 * A longer horizon doesn't gain us anything — the per-tick dedup
 * check already prevents re-firing, and the per-step grace window
 * stays the same regardless of horizon.
 */
const LOOKAHEAD_SEC = 14 * 24 * 60 * 60;

function resolveAlertSpecs(
  slot: 1 | 2 | 3,
  // "threshold" never reaches here — it has no firingTime and is
  // evaluated in its own branch of the per-stream loop.
  triggerType: Exclude<AlertTriggerType, "threshold">,
  hoursBefore: number,
  stream: VestingStream,
  nowSec: number,
): AlertSpec[] {
  switch (triggerType) {
    case "before-unlock": {
      // Multi-step branch: discrete unlock schedule. Fan out across
      // each upcoming step within the lookahead window.
      const steps = stream.unlockSteps ?? [];
      if (steps.length > 0) {
        const horizon = nowSec + LOOKAHEAD_SEC + 3600; // +1h grace
        return steps
          .filter(s => {
            // Only future-ish steps (allow PAST_GRACE_SEC slack so a
            // freshly-passed step still gets a chance to fire).
            const firingTime = s.timestamp - Math.max(0, hoursBefore) * 3600;
            return firingTime <= horizon && firingTime >= nowSec - 3600;
          })
          .map(s => ({
            slot,
            triggerType,
            eventTime:  s.timestamp,
            firingTime: s.timestamp - Math.max(0, hoursBefore) * 3600,
            hoursBefore,
          }));
      }
      // Linear-stream branch: single nextUnlockTime.
      if (!stream.nextUnlockTime) return [];
      return [{
        slot,
        triggerType,
        eventTime:  stream.nextUnlockTime,
        firingTime: stream.nextUnlockTime - Math.max(0, hoursBefore) * 3600,
        hoursBefore,
      }];
    }
    case "cliff": {
      if (!stream.cliffTime) return [];
      return [{
        slot,
        triggerType,
        eventTime:  stream.cliffTime,
        firingTime: stream.cliffTime,
      }];
    }
    case "stream-end": {
      if (!stream.endTime) return [];
      return [{
        slot,
        triggerType,
        eventTime:  stream.endTime,
        firingTime: stream.endTime,
      }];
    }
    case "claim-ready": {
      // Legacy trigger — current mobile UI doesn't write this value
      // (the "Live unlock" timing chip covers the same event). Kept
      // for prefs stored by older builds. Recurring/multi-unlock
      // branch also applies here so legacy claim-ready alerts on a
      // tranched stream fire at every unlock.
      const steps = stream.unlockSteps ?? [];
      if (steps.length > 0) {
        const horizon = nowSec + LOOKAHEAD_SEC + 3600;
        return steps
          .filter(s => s.timestamp <= horizon && s.timestamp >= nowSec - 3600)
          .map(s => ({
            slot,
            triggerType,
            eventTime:  s.timestamp,
            firingTime: s.timestamp,
          }));
      }
      if (!stream.nextUnlockTime) return [];
      return [{
        slot,
        triggerType,
        eventTime:  stream.nextUnlockTime,
        firingTime: stream.nextUnlockTime,
      }];
    }
    case "vesting-start": {
      // Fires at stream.startTime — useful for pre-TGE allocations
      // where the user knows a token's schedule begins but hasn't
      // seen any tokens yet. By default streams added AFTER they
      // start (the common case) have startTime in the past, so the
      // grace window in the caller would mostly skip these — that's
      // correct: we don't want to spam "your vesting started 6
      // months ago" on a token a user just added.
      if (!stream.startTime) return [];
      return [{
        slot,
        triggerType,
        eventTime:  stream.startTime,
        firingTime: stream.startTime,
      }];
    }
  }
}

/**
 * Push notification title + body, varying by trigger type so each
 * alert reads naturally to the user.
 */
function renderAlertCopy(
  spec: AlertSpec,
  stream: VestingStream,
  nowSec: number,
): { title: string; body: string } {
  const sym = stream.tokenSymbol;
  switch (spec.triggerType) {
    case "before-unlock": {
      // Compute "in Nh" from CURRENT time rather than declared
      // hoursBefore so the body matches reality if the cron tick
      // landed slightly early or late.
      const hrs = Math.max(1, Math.round((spec.eventTime - nowSec) / 3600));
      return {
        title: `${sym} unlocks in ${hrs}h`,
        body:  `${sym} on chain ${stream.chainId} — tap to view.`,
      };
    }
    case "cliff":
      return {
        title: `${sym} cliff reached`,
        body:  `${sym} on chain ${stream.chainId} just hit its cliff — tap to view.`,
      };
    case "stream-end":
      return {
        title: `${sym} vesting complete`,
        body:  `${sym} on chain ${stream.chainId} is fully vested — tap to view.`,
      };
    case "claim-ready":
      return {
        title: `${sym} is now claimable`,
        body:  `${sym} on chain ${stream.chainId} — tap to view.`,
      };
    case "vesting-start":
      return {
        title: `${sym} vesting has started`,
        body:  `${sym} on chain ${stream.chainId} — tap to view your schedule.`,
      };
  }
}
