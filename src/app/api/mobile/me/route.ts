// src/app/api/mobile/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { FREE_PUSH_ALERT_LIMIT, deleteUser } from "@/lib/db/queries";

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Free tier: limit reflects current scheme (10/month, resets monthly).
  // Paid tiers: unmetered (null). The mobile Plan card reads this directly.
  const isFree = !user.tier || user.tier === "free";
  const pushAlertsSent  = user.pushAlertsSent ?? 0;
  const pushAlertsLimit = isFree ? FREE_PUSH_ALERT_LIMIT : null;

  return NextResponse.json({
    id:                  user.id,
    email:               user.address,
    tier:                user.tier,
    userType:            user.userType,
    vestingCount:        user.vestingCount,
    currentTracking:     user.currentTracking,
    audienceCategory:    user.audienceCategory ?? null,
    onboardingCompleted: !!user.onboardingCompletedAt,
    pushAlertsSent,
    pushAlertsLimit,
  });
}

/**
 * DELETE /api/mobile/me
 * Permanently deletes the authenticated mobile user. Required by App
 * Store Connect (Apple guideline 5.1.1(v), since June 2022) AND Google
 * Play Data deletion policy (since 2024) — every app that supports
 * account creation must also support in-app account deletion.
 *
 * Cascades via FK in the schema: wallets, notification preferences,
 * notification history, mobile tokens, mobile OTPs, stream annotations,
 * stream tags, watchlist, saved searches, calendar tokens, pending wallet
 * links — all set `onDelete: "cascade"` so the single DELETE on `users`
 * cleans the lot.
 *
 * Idempotent: re-DELETE with a stale token returns 401 (token no longer
 * validates after row is gone), so a flaky network retry from the app is
 * safe.
 */
export async function DELETE(req: NextRequest) {
  const token = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await deleteUser(userId);

  return NextResponse.json({ ok: true });
}
