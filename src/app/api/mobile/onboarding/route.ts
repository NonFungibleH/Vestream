// src/app/api/mobile/onboarding/route.ts
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
  const { userType, vestingCount, currentTracking, hoursBeforeUnlock } = body;

  await db.update(users)
    .set({
      userType:              userType             ?? null,
      vestingCount:          vestingCount         ?? null,
      currentTracking:       currentTracking      ?? null,
      onboardingCompletedAt: new Date(),
    })
    .where(eq(users.id, userId));

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
