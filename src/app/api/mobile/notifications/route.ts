// GET  → returns current notification preferences
// POST → saves notification preferences
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { notificationPreferences, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normaliseTier } from "@/lib/auth/tier";
import { validateStreamPrefs } from "@/lib/notifications/threshold";

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select({ address: users.address }).from(users).where(eq(users.id, userId)).limit(1);
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);

  return NextResponse.json({
    prefs: prefs ?? {
      emailEnabled:       false,
      email:              user?.address ?? null,
      hoursBeforeUnlock:  24,
      notifyCliff:        true,
      notifyStreamEnd:    true,
      notifyMonthly:      false,
      notifyNextClaim:    true,
      streamPrefs:        {},
    },
  });
}

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    emailEnabled      = false,
    email: rawEmail,
    hoursBeforeUnlock = 24,
    notifyCliff       = true,
    notifyStreamEnd   = true,
    notifyMonthly     = false,
    notifyNextClaim   = true,
    streamPrefs       = {},
  } = body;

  // Validate email if provided
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = typeof rawEmail === "string" && rawEmail.trim().length > 0
    ? rawEmail.trim().toLowerCase()
    : null;
  if (email !== null && (!emailRegex.test(email) || email.length > 320)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Validate hoursBeforeUnlock is a sensible number
  const hours = Number(hoursBeforeUnlock);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
    return NextResponse.json({ error: "hoursBeforeUnlock must be between 1 and 168" }, { status: 400 });
  }

  // Email alerts are Pro-only (May 2026). Force-disable emailEnabled for
  // non-Pro users so the toggle doesn't persist as `true` for someone who
  // can't actually receive emails (the cron also filters by tier as
  // defence-in-depth — see getAllUsersWithEmailEnabled). A silent coerce
  // is preferable to a 403 here so a user who downgraded from Pro to
  // Mobile doesn't see an angry error every time they save unrelated
  // notification prefs; their email row just goes silent.
  const [tierRow] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1);
  const tier = normaliseTier(tierRow?.tier ?? "free");
  const safeEmailEnabled = tier === "pro" ? Boolean(emailEnabled) : false;

  // streamPrefs is a flexible jsonb bag (per-token alert overrides
  // keyed by stream id). Defensively reject anything that isn't an
  // object so a malformed request can't blow up the rest of the row.
  // validateStreamPrefs additionally whitelists alertNTriggerType
  // values (incl. the 2026-06 "threshold" trigger) and bounds-checks /
  // rounds thresholdUsd1-3 to whole dollars in [1, 1,000,000]; other
  // per-stream keys pass through untouched.
  const checkedPrefs = validateStreamPrefs(streamPrefs);
  if (!checkedPrefs.ok) {
    return NextResponse.json({ error: checkedPrefs.error }, { status: 400 });
  }
  const safeStreamPrefs = checkedPrefs.value;

  const [existing] = await db.select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing) {
    await db.update(notificationPreferences)
      .set({
        emailEnabled: safeEmailEnabled, email, hoursBeforeUnlock: hours,
        notifyCliff, notifyStreamEnd, notifyMonthly, notifyNextClaim,
        streamPrefs: safeStreamPrefs,
        updatedAt: new Date(),
      })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences)
      .values({
        userId, emailEnabled: safeEmailEnabled, email, hoursBeforeUnlock: hours,
        notifyCliff, notifyStreamEnd, notifyMonthly, notifyNextClaim,
        streamPrefs: safeStreamPrefs,
      });
  }

  return NextResponse.json({ ok: true });
}
