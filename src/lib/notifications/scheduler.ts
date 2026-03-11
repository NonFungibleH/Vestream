import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { sendEmailNotification } from "./email";
import {
  getAllUsersWithEmailEnabled,
  getWalletsForUser,
  hasNotificationBeenSent,
  recordNotificationSent,
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

    const windowSec = hoursBeforeUnlock * 60 * 60;

    for (const stream of streams) {
      if (!stream.nextUnlockTime) continue;
      const timeUntil = stream.nextUnlockTime - nowSec;
      if (timeUntil <= 0 || timeUntil > windowSec) continue;

      const unlockDate = new Date(stream.nextUnlockTime * 1000);

      const alreadySent = await hasNotificationBeenSent(userId, stream.id, unlockDate);
      if (alreadySent) continue;

      try {
        await sendEmailNotification(email, stream, unlockDate);
        await recordNotificationSent(userId, stream.id, unlockDate);
        notifiedCount++;
      } catch (err) {
        console.error(`Failed to send notification for stream ${stream.id}:`, err);
      }
    }
  }

  return notifiedCount;
}
