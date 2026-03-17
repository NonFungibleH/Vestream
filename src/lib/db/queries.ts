import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "./index";
import {
  users,
  wallets,
  notificationPreferences,
  notificationsSent,
} from "./schema";

export async function getUserByAddress(address: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.address, address.toLowerCase()))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertUser(address: string) {
  const normalized = address.toLowerCase();
  const existing = await getUserByAddress(normalized);
  if (existing) return existing;

  const result = await db
    .insert(users)
    .values({ address: normalized })
    .returning();
  return result[0];
}

export async function getWalletsForUser(userId: string) {
  return db.select().from(wallets).where(eq(wallets.userId, userId));
}

export async function addWallet(
  userId: string,
  address: string,
  label?: string,
  chains?: string[] | null,
  protocols?: string[] | null,
  tokenAddress?: string | null,
) {
  const result = await db
    .insert(wallets)
    .values({
      userId,
      address:      address.toLowerCase(),
      label,
      chains:       chains       ?? null,
      protocols:    protocols    ?? null,
      tokenAddress: tokenAddress ?? null,
    })
    .returning();
  return result[0];
}

export async function updateWalletConfig(
  userId: string,
  address: string,
  chains:    string[] | null,
  protocols: string[] | null,
) {
  const result = await db
    .update(wallets)
    .set({ chains, protocols })
    .where(and(eq(wallets.userId, userId), eq(wallets.address, address.toLowerCase())))
    .returning();
  return result[0] ?? null;
}

export async function deleteWallet(userId: string, address: string) {
  return db
    .delete(wallets)
    .where(
      and(eq(wallets.userId, userId), eq(wallets.address, address.toLowerCase()))
    );
}

export async function updateWalletLabel(userId: string, address: string, label: string | null) {
  const result = await db
    .update(wallets)
    .set({ label: label ?? null })
    .where(
      and(eq(wallets.userId, userId), eq(wallets.address, address.toLowerCase()))
    )
    .returning();
  return result[0] ?? null;
}

/** Update any combination of label / chains / protocols / tokenAddress for a wallet. */
export async function updateWallet(
  userId: string,
  address: string,
  updates: {
    label?:        string | null;
    chains?:       string[] | null;
    protocols?:    string[] | null;
    tokenAddress?: string | null;
  },
) {
  const result = await db
    .update(wallets)
    .set(updates)
    .where(and(eq(wallets.userId, userId), eq(wallets.address, address.toLowerCase())))
    .returning();
  return result[0] ?? null;
}

export async function getNotificationPreferences(userId: string) {
  const result = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return result[0] ?? null;
}

export async function upsertNotificationPreferences(
  userId: string,
  data: Partial<{
    emailEnabled: boolean;
    email: string | null;
    hoursBeforeUnlock: number;
    notifyCliff: boolean;
    notifyStreamEnd: boolean;
    notifyMonthly: boolean;
  }>
) {
  const existing = await getNotificationPreferences(userId);
  if (existing) {
    const result = await db
      .update(notificationPreferences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId))
      .returning();
    return result[0];
  } else {
    const result = await db
      .insert(notificationPreferences)
      .values({ userId, ...data })
      .returning();
    return result[0];
  }
}

export async function hasNotificationBeenSent(
  userId: string,
  streamId: string,
  unlockTimestamp: Date
) {
  const windowMs = 60 * 60 * 1000; // 1 hour tolerance
  const result = await db
    .select()
    .from(notificationsSent)
    .where(
      and(
        eq(notificationsSent.userId, userId),
        eq(notificationsSent.streamId, streamId),
        gte(
          notificationsSent.unlockTimestamp,
          new Date(unlockTimestamp.getTime() - windowMs)
        ),
        lte(
          notificationsSent.unlockTimestamp,
          new Date(unlockTimestamp.getTime() + windowMs)
        )
      )
    )
    .limit(1);
  return result.length > 0;
}

export async function recordNotificationSent(
  userId: string,
  streamId: string,
  unlockTimestamp: Date
) {
  return db.insert(notificationsSent).values({
    userId,
    streamId,
    unlockTimestamp,
  });
}

/**
 * Check whether a user has scan quota remaining, and if so, increment their count.
 * Quota: 3 scans per rolling 24-hour window.
 * Returns { allowed, remaining, resetAt } — caller must check `allowed` before proceeding.
 */
export async function checkAndIncrementScanCount(
  userId: string
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const row = await db
    .select({ scanCount: users.scanCount, scanWindowStart: users.scanWindowStart })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row[0]) return { allowed: false, remaining: 0, resetAt: new Date() };

  const LIMIT  = 3;
  const WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms
  const now    = new Date();
  const { scanCount, scanWindowStart } = row[0];

  const windowExpired =
    !scanWindowStart || now.getTime() - scanWindowStart.getTime() >= WINDOW;

  if (windowExpired) {
    // Start a fresh 24-hour window
    await db.update(users)
      .set({ scanCount: 1, scanWindowStart: now })
      .where(eq(users.id, userId));
    return { allowed: true, remaining: LIMIT - 1, resetAt: new Date(now.getTime() + WINDOW) };
  }

  if (scanCount >= LIMIT) {
    return { allowed: false, remaining: 0, resetAt: new Date(scanWindowStart!.getTime() + WINDOW) };
  }

  await db.update(users)
    .set({ scanCount: scanCount + 1 })
    .where(eq(users.id, userId));
  return {
    allowed:   true,
    remaining: LIMIT - 1 - scanCount,
    resetAt:   new Date(scanWindowStart!.getTime() + WINDOW),
  };
}

export async function deleteUser(userId: string) {
  // Wallets, notificationPreferences, and notificationsSent all have
  // onDelete: "cascade" so they are cleaned up automatically.
  return db.delete(users).where(eq(users.id, userId));
}

export async function getAllUsersWithEmailEnabled() {
  return db
    .select({
      userId: notificationPreferences.userId,
      email: notificationPreferences.email,
      hoursBeforeUnlock: notificationPreferences.hoursBeforeUnlock,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.emailEnabled, true)
      )
    );
}
