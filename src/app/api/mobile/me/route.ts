// src/app/api/mobile/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";

export async function GET(req: NextRequest) {
  const token = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getMobileUser(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id:                  user.id,
    email:               user.address,
    tier:                user.tier,
    userType:            user.userType,
    vestingCount:        user.vestingCount,
    currentTracking:     user.currentTracking,
    onboardingCompleted: !!user.onboardingCompletedAt,
  });
}
