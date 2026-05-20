import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { sendEmailNotification } from "./email";
import { sendExpoPush } from "./push";
import {
  getAllUsersWithAnyAlertEnabled,
  getWalletsForUser,
  hasNotificationBeenSent,
  recordNotificationSent,
  checkAndConsumePushCredit,
} from "@/lib/db/queries";
import type { VestingStream } from "@/lib/vesting/types";

type AlertTriggerType =
  | "before-unlock"
  | "vesting-start"
  | "cliff"
  | "stream-end"
  | "claim-ready";  // legacy; functionally same as before-unlock @ 0h

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
  triggerType: AlertTriggerType;
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
  let notifiedCount = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  // Slop windows. Tuned for a 5-minute cron cadence.
  // - PAST_GRACE_SEC=3600 lets a cron tick a few minutes after the
  //   event still fire (the dedup table prevents a third tick from
  //   re-firing).
  // - FUTURE_SLOP_SEC=300 lets "fire at event" (e.g. claim-ready or
  //   live-unlock) catch the just-before tick that lands within 5
  //   minutes of the event.
  const PAST_GRACE_SEC = 3600;
  const FUTURE_SLOP_SEC = 300;

  const usersToNotify = await getAllUsersWithAnyAlertEnabled();

  for (const {
    userId, email, hoursBeforeUnlock,
    emailEnabled, streamPrefs, tier, expoPushToken,
  } of usersToNotify) {
    const walletRows = await getWalletsForUser(userId);
    if (walletRows.length === 0) continue;

    const addresses = walletRows.map((w) => w.address);

    let streams: VestingStream[];
    try {
      streams = await aggregateVestingStreams(addresses);
    } catch (err) {
      console.error(`Failed to fetch vesting data for user ${userId}:`, err);
      continue;
    }

    const canEmail = emailEnabled && tier === "pro" && !!email;
    const canPush  = !!expoPushToken;
    if (!canEmail && !canPush) continue;

    const prefsMap = (streamPrefs ?? {}) as Record<string, PerStreamPref>;

    for (const stream of streams) {
      // Per-stream opt-in is REQUIRED. A user who never visited the
      // Alerts tab for this token gets nothing — see the 2026-05-20
      // privacy fix comment in the earlier scheduler version.
      const perStream = prefsMap[stream.id];
      if (!perStream) continue;

      // Gather the alert specs for this stream — up to 2 per stream.
      const alertSpecs: AlertSpec[] = [];

      // ── Alert 1 ──
      if (perStream.alert1Enabled === true) {
        const spec = resolveAlertSpec(
          1,
          perStream.alert1TriggerType ?? "before-unlock",
          perStream.hoursBeforeUnlock ?? hoursBeforeUnlock,
          stream,
        );
        if (spec) alertSpecs.push(spec);
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
        const hoursBefore =
          triggerType === "before-unlock"
            ? (perStream.pushTiming2 ?? 1)
            : 0;
        const spec = resolveAlertSpec(2, triggerType, hoursBefore, stream);
        if (spec) alertSpecs.push(spec);
      }

      // ── Alert 3 ──
      // 2026-05-20: new slot. Always uses the explicit alert3Enabled
      // flag — no legacy fallback (the slot didn't exist before this
      // commit, so no older mobile builds can be writing pushTiming3
      // without alert3Enabled).
      if (perStream.alert3Enabled === true) {
        const triggerType: AlertTriggerType =
          perStream.alert3TriggerType ?? "before-unlock";
        const hoursBefore =
          triggerType === "before-unlock"
            ? (perStream.pushTiming3 ?? 0)
            : 0;
        const spec = resolveAlertSpec(3, triggerType, hoursBefore, stream);
        if (spec) alertSpecs.push(spec);
      }

      if (alertSpecs.length === 0) continue;

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
              await sendEmailNotification(email, stream, new Date(spec.eventTime * 1000));
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
          // retry next hour would prematurely dedupe.
          if (sentSomething) {
            await recordNotificationSent(userId, stream.id, dedupDate);
            notifiedCount++;
          }
        } catch (err) {
          console.error(`Failed to send notification for stream ${stream.id} slot ${spec.slot}:`, err);
        }
      }
    }
  }

  return notifiedCount;
}

/**
 * Build a concrete firing spec for one alert slot, given the trigger
 * type the user picked and the stream's lifecycle timestamps. Returns
 * null when the trigger has no event to fire against (e.g. "cliff"
 * for a stream that has no cliff defined).
 */
function resolveAlertSpec(
  slot: 1 | 2 | 3,
  triggerType: AlertTriggerType,
  hoursBefore: number,
  stream: VestingStream,
): AlertSpec | null {
  switch (triggerType) {
    case "before-unlock": {
      if (!stream.nextUnlockTime) return null;
      return {
        slot,
        triggerType,
        eventTime:  stream.nextUnlockTime,
        firingTime: stream.nextUnlockTime - Math.max(0, hoursBefore) * 3600,
        hoursBefore,
      };
    }
    case "cliff": {
      if (!stream.cliffTime) return null;
      return {
        slot,
        triggerType,
        eventTime:  stream.cliffTime,
        firingTime: stream.cliffTime,
      };
    }
    case "stream-end": {
      if (!stream.endTime) return null;
      return {
        slot,
        triggerType,
        eventTime:  stream.endTime,
        firingTime: stream.endTime,
      };
    }
    case "claim-ready": {
      // "Claim ready" = the moment the next unlock fires + makes
      // tokens claimable. Implemented as "fire AT nextUnlockTime"
      // (zero lead-time). Distinct from "before-unlock at 0h" only
      // in the user-facing copy. Legacy — current mobile UI doesn't
      // write this value (the "Live unlock" timing chip covers
      // the same event), but we keep handling it for any prefs
      // stored by older builds.
      if (!stream.nextUnlockTime) return null;
      return {
        slot,
        triggerType,
        eventTime:  stream.nextUnlockTime,
        firingTime: stream.nextUnlockTime,
      };
    }
    case "vesting-start": {
      // Fires at stream.startTime — useful for pre-TGE allocations
      // where the user knows a token's schedule begins but hasn't
      // seen any tokens yet. By default streams added AFTER they
      // start (the common case) have startTime in the past, so the
      // grace window in the caller would mostly skip these — that's
      // correct: we don't want to spam "your vesting started 6
      // months ago" on a token a user just added.
      if (!stream.startTime) return null;
      return {
        slot,
        triggerType,
        eventTime:  stream.startTime,
        firingTime: stream.startTime,
      };
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
