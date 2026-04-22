import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { sendEmailNotification } from "./email";
import { sendExpoPush } from "./push";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getAllUsersWithEmailEnabled,
  getWalletsForUser,
  hasNotificationBeenSent,
  recordNotificationSent,
  checkAndConsumePushCredit,
} from "@/lib/db/queries";

export async function runNotificationJob(): Promise<number> {
  let notifiedCount = 0;
  const nowSec = Math.floor(Date.now() / 1000);

  const usersToNotify = await getAllUsersWithEmailEnabled();

  for (const { userId, email, hoursBeforeUnlock } of usersToNotify) {
    if (!email) continue;

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

    // Look up the user's Expo push token once per user — used for push fan-out below.
    const userRow = await db
      .select({ expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const expoPushToken = userRow[0]?.expoPushToken ?? null;

    const windowSec = hoursBeforeUnlock * 60 * 60;

    for (const stream of streams) {
      if (!stream.nextUnlockTime) continue;
      const timeUntil = stream.nextUnlockTime - nowSec;
      if (timeUntil <= 0 || timeUntil > windowSec) continue;

      const unlockDate = new Date(stream.nextUnlockTime * 1000);

      const alreadySent = await hasNotificationBeenSent(userId, stream.id, unlockDate);
      if (alreadySent) continue;

      try {
        // 1. Email (no credit gate — email is on every tier that has it enabled).
        await sendEmailNotification(email, stream, unlockDate);

        // 2. Push (free tier: 3 lifetime credits; paid: unmetered).
        if (expoPushToken) {
          const credit = await checkAndConsumePushCredit(userId);
          if (credit.allowed) {
            const hrs = Math.round((stream.nextUnlockTime - nowSec) / 3600);
            await sendExpoPush({
              to:    expoPushToken,
              title: `${stream.tokenSymbol} unlocks in ${hrs}h`,
              body:  `${stream.tokenSymbol} on chain ${stream.chainId} — tap to view.`,
              data:  { streamId: stream.id, url: `/stream/${stream.id}` },
            }).catch((err) => {
              console.error(`Push send failed for user ${userId}:`, err);
            });
          }
        }

        await recordNotificationSent(userId, stream.id, unlockDate);
        notifiedCount++;
      } catch (err) {
        console.error(`Failed to send notification for stream ${stream.id}:`, err);
      }
    }
  }

  return notifiedCount;
}
