import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  users,
  wallets,
  notificationPreferences,
  notificationsSent,
  betaFeedback,
  streamAnnotations,
  streamTags,
  calendarTokens,
} from "./schema";
import { randomBytes } from "node:crypto";
import { normaliseAddress } from "@/lib/address-validation";

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

  // New users start on the Free plan — no trial period.
  const result = await db
    .insert(users)
    .values({ address: normalized, tier: "free" })
    .onConflictDoNothing()
    .returning();

  // If onConflictDoNothing fired, the returning() array is empty — fetch existing row
  if (result.length === 0) {
    return (await getUserByAddress(normalized))!;
  }

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
  // Use ecosystem-aware normalisation: EVM addresses get lowercased (matches
  // storage), Solana base58 pubkeys are passed through case-sensitive (a
  // raw `.toLowerCase()` would corrupt them and silently no-op the delete).
  return db
    .delete(wallets)
    .where(
      and(eq(wallets.userId, userId), eq(wallets.address, normaliseAddress(address)))
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
 * Tier-aware quota:
 *   - Free tier  → 3 lifetime scans (no window reset). Once exhausted,
 *     the only path forward is upgrading to Pro. This gives every signed-
 *     up user a real taste of Discover without us underwriting unlimited
 *     scans for accounts that may never convert.
 *   - Pro / Fund → 3 scans per rolling 24-hour window. Familiar daily-
 *     budget shape, plenty for most workflows.
 *
 * Returns { allowed, remaining, resetAt, tier } — `resetAt` is meaningless
 * for the free-lifetime path (no reset ever happens) but we still return a
 * date so the caller's TypeScript signature stays uniform; the UI uses
 * `tier === "free"` to decide whether to show the reset clock.
 */
export async function checkAndIncrementScanCount(
  userId: string,
  tier:   string,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date; tier: string }> {
  const row = await db
    .select({ scanCount: users.scanCount, scanWindowStart: users.scanWindowStart })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row[0]) return { allowed: false, remaining: 0, resetAt: new Date(), tier };

  const LIMIT       = 3;
  const WINDOW_MS   = 24 * 60 * 60 * 1000;
  const now         = new Date();
  const { scanCount, scanWindowStart } = row[0];
  const isFree      = tier === "free";

  // ── Free tier: lifetime cap, no window reset ─────────────────────────
  if (isFree) {
    if (scanCount >= LIMIT) {
      return { allowed: false, remaining: 0, resetAt: new Date(0), tier };
    }
    await db.update(users)
      .set({
        scanCount:        scanCount + 1,
        // Stamp scanWindowStart on first-ever scan so the UI can show
        // "first used: <date>" if we ever want it. Not used for reset
        // logic on free.
        scanWindowStart:  scanWindowStart ?? now,
      })
      .where(eq(users.id, userId));
    return {
      allowed:   true,
      remaining: LIMIT - 1 - scanCount,
      resetAt:   new Date(0),
      tier,
    };
  }

  // ── Pro / Fund: 3 per rolling 24h ────────────────────────────────────
  const windowExpired =
    !scanWindowStart || now.getTime() - scanWindowStart.getTime() >= WINDOW_MS;

  if (windowExpired) {
    await db.update(users)
      .set({ scanCount: 1, scanWindowStart: now })
      .where(eq(users.id, userId));
    return { allowed: true, remaining: LIMIT - 1, resetAt: new Date(now.getTime() + WINDOW_MS), tier };
  }

  if (scanCount >= LIMIT) {
    return { allowed: false, remaining: 0, resetAt: new Date(scanWindowStart!.getTime() + WINDOW_MS), tier };
  }

  await db.update(users)
    .set({ scanCount: scanCount + 1 })
    .where(eq(users.id, userId));
  return {
    allowed:   true,
    remaining: LIMIT - 1 - scanCount,
    resetAt:   new Date(scanWindowStart!.getTime() + WINDOW_MS),
    tier,
  };
}

/**
 * Free users get 3 lifetime push-alert credits. Pro/Fund are unmetered.
 *
 * Call this immediately BEFORE sending a push to check+consume a credit atomically.
 * Returns { allowed: true } if the push should be sent, false if the free user
 * has already burned through their 3 credits.
 */
export const FREE_PUSH_ALERT_LIMIT = 3;

export async function checkAndConsumePushCredit(
  userId: string
): Promise<{ allowed: boolean; remaining: number | null }> {
  const row = await db
    .select({ tier: users.tier, pushAlertsSent: users.pushAlertsSent })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row[0]) return { allowed: false, remaining: 0 };

  const { tier, pushAlertsSent } = row[0];
  // Paid tiers: unlimited. Don't increment counter for them.
  if (tier && tier !== "free") {
    return { allowed: true, remaining: null };
  }

  if (pushAlertsSent >= FREE_PUSH_ALERT_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  await db.update(users)
    .set({ pushAlertsSent: pushAlertsSent + 1 })
    .where(eq(users.id, userId));

  return {
    allowed:   true,
    remaining: FREE_PUSH_ALERT_LIMIT - 1 - pushAlertsSent,
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

// ── Beta helpers ───────────────────────────────────────────────────────────────

/** Returns the total number of registered users. */
export async function countUsers(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  return result[0]?.count ?? 0;
}

/** Saves a piece of beta feedback. */
export async function saveFeedback(opts: {
  userAddress?: string;
  rating?:      number;
  message:      string;
  page?:        string;
}) {
  await db.insert(betaFeedback).values({
    userAddress: opts.userAddress ?? null,
    rating:      opts.rating     ?? null,
    message:     opts.message,
    page:        opts.page       ?? null,
  });
}

// ─── Stream annotations (custom names + notes) ──────────────────────────────

/** Cap matches the API-layer enforcement — keep in sync. */
export const STREAM_ANNOTATION_NOTES_MAX = 200;
/** Custom names get a tighter cap — they render inline next to amounts. */
export const STREAM_ANNOTATION_NAME_MAX  = 80;

export interface StreamAnnotation {
  streamId:   string;
  customName: string | null;
  notes:      string | null;
  updatedAt:  Date;
}

/** Fetch a single annotation. Returns null if the user hasn't annotated this stream. */
export async function getStreamAnnotation(
  userId:   string,
  streamId: string,
): Promise<StreamAnnotation | null> {
  const rows = await db
    .select({
      streamId:   streamAnnotations.streamId,
      customName: streamAnnotations.customName,
      notes:      streamAnnotations.notes,
      updatedAt:  streamAnnotations.updatedAt,
    })
    .from(streamAnnotations)
    .where(and(
      eq(streamAnnotations.userId,   userId),
      eq(streamAnnotations.streamId, streamId),
    ))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch all annotations for a user, optionally filtered to a stream-id list.
 * Used by the dashboard to bulk-attach annotations to its stream list in one
 * round-trip rather than one query per stream.
 */
export async function getStreamAnnotationsForUser(
  userId:       string,
  streamIds?:   readonly string[],
): Promise<StreamAnnotation[]> {
  const where = streamIds && streamIds.length > 0
    ? and(eq(streamAnnotations.userId, userId), inArray(streamAnnotations.streamId, [...streamIds]))
    : eq(streamAnnotations.userId, userId);
  return db
    .select({
      streamId:   streamAnnotations.streamId,
      customName: streamAnnotations.customName,
      notes:      streamAnnotations.notes,
      updatedAt:  streamAnnotations.updatedAt,
    })
    .from(streamAnnotations)
    .where(where);
}

/**
 * Upsert a stream annotation. Pass `customName: null` and `notes: null`
 * together to clear (or use deleteStreamAnnotation directly — same effect
 * via the row-removal path, with the bonus of freeing the row).
 *
 * Caller is responsible for length-cap enforcement (the API route does
 * this so we can return a clean 400 with a useful message). DB schema
 * has no length cap so future relaxation doesn't need a migration.
 */
export async function upsertStreamAnnotation(opts: {
  userId:     string;
  streamId:   string;
  customName: string | null;
  notes:      string | null;
}): Promise<StreamAnnotation> {
  const now = new Date();
  const [row] = await db
    .insert(streamAnnotations)
    .values({
      userId:     opts.userId,
      streamId:   opts.streamId,
      customName: opts.customName,
      notes:      opts.notes,
      createdAt:  now,
      updatedAt:  now,
    })
    .onConflictDoUpdate({
      target: [streamAnnotations.userId, streamAnnotations.streamId],
      set: {
        customName: opts.customName,
        notes:      opts.notes,
        updatedAt:  now,
      },
    })
    .returning({
      streamId:   streamAnnotations.streamId,
      customName: streamAnnotations.customName,
      notes:      streamAnnotations.notes,
      updatedAt:  streamAnnotations.updatedAt,
    });
  return row;
}

export async function deleteStreamAnnotation(
  userId:   string,
  streamId: string,
): Promise<void> {
  await db
    .delete(streamAnnotations)
    .where(and(
      eq(streamAnnotations.userId,   userId),
      eq(streamAnnotations.streamId, streamId),
    ));
}

// ─── Stream tags ────────────────────────────────────────────────────────────

/** Caps mirror API-layer enforcement; keep in sync with the route validator. */
export const STREAM_TAG_VALUE_MAX = 30;
/** Max number of distinct tags per stream — prevents abuse/clutter. */
export const STREAM_TAG_PER_STREAM_MAX = 10;

export interface StreamTag {
  streamId: string;
  tag:      string;
  color:    string | null;
}

export async function getStreamTags(userId: string, streamId: string): Promise<StreamTag[]> {
  return db
    .select({
      streamId: streamTags.streamId,
      tag:      streamTags.tag,
      color:    streamTags.color,
    })
    .from(streamTags)
    .where(and(eq(streamTags.userId, userId), eq(streamTags.streamId, streamId)));
}

/** Bulk fetch — all of a user's tags across all streams. Used by the
 *  dashboard to populate filter chips + per-row pills in one round-trip. */
export async function getStreamTagsForUser(
  userId:    string,
  streamIds?: readonly string[],
): Promise<StreamTag[]> {
  const where = streamIds && streamIds.length > 0
    ? and(eq(streamTags.userId, userId), inArray(streamTags.streamId, [...streamIds]))
    : eq(streamTags.userId, userId);
  return db
    .select({
      streamId: streamTags.streamId,
      tag:      streamTags.tag,
      color:    streamTags.color,
    })
    .from(streamTags)
    .where(where);
}

/**
 * Replace the full tag set for a single (user, streamId). Inserts new
 * tags, removes deleted ones — atomic-ish via two queries (delete-then-
 * insert). Acceptable for a low-write feature like tags; if write
 * frequency grows, switch to a proper merge.
 */
export async function setStreamTags(
  userId:   string,
  streamId: string,
  tags:     Array<{ tag: string; color: string | null }>,
): Promise<StreamTag[]> {
  // Wipe existing tags for this (user, stream).
  await db
    .delete(streamTags)
    .where(and(eq(streamTags.userId, userId), eq(streamTags.streamId, streamId)));

  if (tags.length === 0) return [];

  // Dedupe by tag value before insert (composite PK rejects dupes; cheaper
  // to filter here than catch the violation).
  const seen = new Set<string>();
  const rows = tags
    .filter((t) => {
      if (seen.has(t.tag)) return false;
      seen.add(t.tag);
      return true;
    })
    .map((t) => ({
      userId,
      streamId,
      tag:   t.tag,
      color: t.color,
    }));

  if (rows.length === 0) return [];

  await db.insert(streamTags).values(rows);
  return rows.map((r) => ({ streamId: r.streamId, tag: r.tag, color: r.color }));
}

export async function deleteStreamTags(userId: string, streamId: string): Promise<void> {
  await db
    .delete(streamTags)
    .where(and(eq(streamTags.userId, userId), eq(streamTags.streamId, streamId)));
}

// ─── Calendar tokens (per-user iCal feed auth) ──────────────────────────────

/** Token format prefix — matches our `vstr_*` convention elsewhere. */
const CALENDAR_TOKEN_PREFIX = "vstr_cal_";

function generateCalendarToken(): string {
  return CALENDAR_TOKEN_PREFIX + randomBytes(32).toString("hex");
}

export interface CalendarTokenRow {
  userId:        string;
  token:         string;
  createdAt:     Date;
  lastFetchedAt: Date | null;
}

/**
 * Get the user's existing calendar token, or generate one if none exists.
 * Idempotent — calling repeatedly returns the same token until a rotation.
 */
export async function getOrCreateCalendarToken(userId: string): Promise<CalendarTokenRow> {
  const existing = await db
    .select()
    .from(calendarTokens)
    .where(eq(calendarTokens.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const token = generateCalendarToken();
  const [row] = await db
    .insert(calendarTokens)
    .values({ userId, token })
    .returning();
  return row;
}

/**
 * Force a new token, invalidating the old one. Calendar apps subscribed
 * to the old URL will start 404'ing — by design, since the user
 * presumably rotated for a security reason.
 */
export async function rotateCalendarToken(userId: string): Promise<CalendarTokenRow> {
  const token = generateCalendarToken();
  await db
    .delete(calendarTokens)
    .where(eq(calendarTokens.userId, userId));
  const [row] = await db
    .insert(calendarTokens)
    .values({ userId, token })
    .returning();
  return row;
}

/** Lookup by token (URL path). Returns the user's id + the row, or null. */
export async function findUserByCalendarToken(token: string): Promise<{ userId: string; row: CalendarTokenRow } | null> {
  const [row] = await db
    .select()
    .from(calendarTokens)
    .where(eq(calendarTokens.token, token))
    .limit(1);
  if (!row) return null;
  return { userId: row.userId, row };
}

/** Bumped from the .ics handler each time a calendar app polls.
 *  Fire-and-forget — never blocks the response. */
export async function touchCalendarToken(userId: string): Promise<void> {
  await db
    .update(calendarTokens)
    .set({ lastFetchedAt: new Date() })
    .where(eq(calendarTokens.userId, userId));
}
