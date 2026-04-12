// src/app/api/mobile/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Task 17: Trial expiry check — if pro trial has expired and no active Stripe subscription, downgrade to free
  if (
    user.tier === "pro" &&
    user.trialEndsAt &&
    user.trialEndsAt < new Date() &&
    !user.stripeSubscriptionId
  ) {
    await db.update(users).set({ tier: "free" }).where(eq(users.id, userId));
    user = { ...user, tier: "free" };
  }

  return NextResponse.json({
    id:                  user.id,
    email:               user.address,
    tier:                user.tier,
    userType:            user.userType,
    vestingCount:        user.vestingCount,
    currentTracking:     user.currentTracking,
    onboardingCompleted: !!user.onboardingCompletedAt,
    trialEndsAt:         user.trialEndsAt,
  });
}
