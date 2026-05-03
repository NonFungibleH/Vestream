// POST /api/mobile/auth/from-web-token
// ─────────────────────────────────────────────────────────────────────────────
// Consumes a handoff token minted by /api/auth/mobile-handoff and returns a
// regular mobile bearer + user payload. Same response shape as the verify-OTP
// path so the mobile auth flow can call this and `setAuth(token, user)` with
// no special-casing.
//
// Atomic single-use: we use Redis GETDEL so a replay with the same handoff
// is impossible. The window is also short (5 min from mint).
//
// Failure modes:
//   400 — missing/empty token
//   401 — token unknown, expired, or already consumed
//   500 — Redis unavailable (should be vanishingly rare; we fail closed)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createMobileToken, hashValue } from "@/lib/mobile-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return Redis.fromEnv();
}

export async function POST(req: NextRequest) {
  // Rate-limit per IP — 20 attempts / 5 min. Higher than the issuer because
  // legitimate mobile clients may retry on flaky networks.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("mobile:from-web-token", ip, 20, "5 m");
  const blocked = rateLimitResponse(rl, "Too many handoff attempts. Try again in a few minutes.");
  if (blocked) return blocked;

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const handoff = body.token?.trim();
  if (!handoff || !handoff.startsWith("vstr_handoff_")) {
    return NextResponse.json({ error: "Missing or malformed token" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Atomic GETDEL — if this returns null the token was unknown, expired, or
  // already consumed by a prior call. We don't distinguish: from the
  // attacker's POV all three look identical.
  const hash = hashValue(handoff);
  const userId = await redis.getdel<string>(`mobile_handoff:${hash}`);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or expired handoff token" }, { status: 401 });
  }

  // Fetch the user. If the row vanished between mint and consume (e.g. the
  // user deleted their account in the interval) we fail closed.
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Mint a regular mobile bearer — same shape as the OTP path so the mobile
  // client doesn't need a second verify code path.
  const mobileToken = await createMobileToken(user.id);

  return NextResponse.json({
    token: mobileToken,
    user: {
      id:                  user.id,
      email:               user.address,
      tier:                user.tier,
      userType:            user.userType,
      vestingCount:        user.vestingCount,
      currentTracking:     user.currentTracking,
      audienceCategory:    user.audienceCategory ?? null,
      onboardingCompleted: !!user.onboardingCompletedAt,
    },
  });
}
