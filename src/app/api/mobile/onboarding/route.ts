// src/app/api/mobile/onboarding/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mobile onboarding-answers endpoint. Persists the user's worker-pivot
// answers (audienceCategory, userType, vestingCount, currentTracking)
// plus an optional notification preference.
//
// PARTIAL-UPDATE SEMANTICS (May 5 2026): the route now only writes
// fields that are explicitly present in the request body. Previously it
// `?? null`d every field, which meant a follow-up POST sending just
// { audienceCategory } would null-out userType / vestingCount / etc.
//
// The Vestream Invest / Payroll mode switcher (mobile) calls this with
// just { audienceCategory } when the user flips modes mid-flight, so
// the web /dashboard/exports surface re-orders to match the new
// audience. Without partial-update semantics, every mode switch would
// silently wipe the rest of the user's onboarding data.
//
// Safe to call repeatedly — onboardingCompletedAt is updated on every
// successful POST (we treat any update as the user re-confirming their
// preferences).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users, notificationPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { userType, vestingCount, currentTracking, hoursBeforeUnlock, audienceCategory } = body;

  // Build the update object dynamically — only include keys whose values
  // were actually sent by the caller. Drizzle's `.set()` with an empty
  // object would still update updatedAt (we add onboardingCompletedAt
  // explicitly here for the same purpose), so we early-return if nothing
  // was provided.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {};

  if (typeof userType        === "string") update.userType        = userType;
  if (typeof vestingCount    === "string") update.vestingCount    = vestingCount;
  if (typeof currentTracking === "string") update.currentTracking = currentTracking;

  // Worker-pivot field: only persist when explicitly present AND valid.
  // Defensive against older clients sending arbitrary strings.
  if (audienceCategory !== undefined) {
    if (audienceCategory === "investor" || audienceCategory === "worker" || audienceCategory === "both") {
      update.audienceCategory = audienceCategory;
    } else if (audienceCategory === null) {
      // Explicit null → caller wants to clear the field.
      update.audienceCategory = null;
    }
    // Any other value → ignore silently (don't touch the column).
  }

  if (Object.keys(update).length > 0) {
    update.onboardingCompletedAt = new Date();
    await db.update(users).set(update).where(eq(users.id, userId));
  }

  // Save notification preference if provided
  if (hoursBeforeUnlock) {
    await db.insert(notificationPreferences)
      .values({ userId, hoursBeforeUnlock, emailEnabled: false })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { hoursBeforeUnlock },
      });
  }

  return NextResponse.json({ ok: true });
}
