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

/**
 * Runs the unlock-notification scheduler.
 *
 * Major rewrite 2026-05-13. Previously the user-enumeration query was
 * `getAllUsersWithEmailEnabled` which filtered on emailEnabled=true AND
 * tier=pro — meaning Free users with push opted in never entered the
 * loop, despite the product promise of 10 push alerts/month on Free.
 * Now we enumerate ANY user with at least one channel configured and
 * gate per-channel inside the loop.
 *
 * Per-channel gates (server-side truth):
 *   - email: emailEnabled = true AND tier = "pro" AND email is set
 *   - push:  expoPushToken is set AND checkAndConsumePushCredit allows
 *
 * Dedupe: `notifications_sent` table key is (userId, streamId, unlockDate)
 * — covers BOTH channels jointly, so we send exactly one email-and-push
 * pair per matching unlock event regardless of how many times the cron
 * runs in the alert window.
 */
export async function runNotificationJob(): Promise<number> {
  let notifiedCount = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  const usersToNotify = await getAllUsersWithAnyAlertEnabled();

  for (const {
    userId, email, hoursBeforeUnlock,
    emailEnabled, tier, expoPushToken,
  } of usersToNotify) {
    const walletRows = await getWalletsForUser(userId);
    if (walletRows.length === 0) continue;

    const addresses = walletRows.map((w) => w.address);

    let streams;
    try {
      streams = await aggregateVestingStreams(addresses);
    } catch (err) {
      console.error(`Failed to fetch vesting data for user ${userId}:`, err);
      continue;
    }

    const windowSec = hoursBeforeUnlock * 60 * 60;

    // Channel pre-gates — evaluated once per user, not per stream, so we
    // don't re-check tier / token presence for every loop iteration.
    const canEmail = emailEnabled && tier === "pro" && !!email;
    const canPush  = !!expoPushToken;

    if (!canEmail && !canPush) continue;

    for (const stream of streams) {
      if (!stream.nextUnlockTime) continue;
      const timeUntil = stream.nextUnlockTime - nowSec;
      if (timeUntil <= 0 || timeUntil > windowSec) continue;

      const unlockDate = new Date(stream.nextUnlockTime * 1000);

      const alreadySent = await hasNotificationBeenSent(userId, stream.id, unlockDate);
      if (alreadySent) continue;

      let sentSomething = false;
      try {
        // ── Email channel ──
        if (canEmail && email) {
          try {
            await sendEmailNotification(email, stream, unlockDate);
            sentSomething = true;
          } catch (err) {
            console.error(`Email send failed for user ${userId}:`, err);
          }
        }

        // ── Push channel ──
        // Free tier: 10 push alerts per calendar month (credit-gated).
        // Paid tiers: unmetered. checkAndConsumePushCredit handles both.
        if (canPush && expoPushToken) {
          const credit = await checkAndConsumePushCredit(userId);
          if (credit.allowed) {
            const hrs = Math.max(1, Math.round((stream.nextUnlockTime - nowSec) / 3600));
            const result = await sendExpoPush({
              to:    expoPushToken,
              title: `${stream.tokenSymbol} unlocks in ${hrs}h`,
              body:  `${stream.tokenSymbol} on chain ${stream.chainId} - tap to view.`,
              data:  { streamId: stream.id, url: `/stream/${stream.id}` },
            }).catch((err) => {
              console.error(`Push send failed for user ${userId}:`, err);
              return { ok: false, error: "send failed" } as const;
            });
            if (result.ok) sentSomething = true;
          }
        }

        // Only record if at least one channel actually fired — otherwise
        // a transient email outage that left push for retry next hour
        // would prematurely dedupe the unlock.
        if (sentSomething) {
          await recordNotificationSent(userId, stream.id, unlockDate);
          notifiedCount++;
        }
      } catch (err) {
        console.error(`Failed to send notification for stream ${stream.id}:`, err);
      }
    }
  }

  return notifiedCount;
}
