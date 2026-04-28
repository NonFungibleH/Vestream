// POST /api/auth/mobile-handoff
// ─────────────────────────────────────────────────────────────────────────────
// Mints a single-use, short-lived handoff token that the mobile app can
// exchange for a regular bearer via /api/mobile/auth/from-web-token. This
// is the "magic link" path that lets a logged-in web user open the iOS app
// and arrive already signed-in — no second OTP, no second email round-trip.
//
// Flow:
//   1. Web user (must be authenticated by iron-session cookie) clicks "Get
//      the app" on the dashboard.
//   2. Browser POSTs here. We mint a one-time handoff token, store its hash
//      in Redis with 5-min TTL keyed by the user id (so we can rotate /
//      revoke on logout if needed) and return the plaintext to the browser.
//   3. Browser builds `vestream://auth?token=<handoff>` and either deep-links
//      directly (if user is on iPhone Safari) or shows a QR code (desktop).
//   4. Mobile app receives the deep link, calls /api/mobile/auth/from-web-token
//      which atomically GETDELs the Redis key and trades the handoff for a
//      regular `vstr_mob_*` bearer. Single-use: a second call with the same
//      handoff fails.
//
// Security properties:
//   - 5-minute TTL: a stolen handoff is useless after 5 min
//   - Single-use: GETDEL on consume — replay doesn't work
//   - Hashed at rest: Redis stores SHA-256 hash, never the raw token
//   - Rate-limited per IP: 10 handoffs / 5 min so a compromised session
//     can't farm tokens at scale
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { hashValue } from "@/lib/mobile-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";

const HANDOFF_TTL_SECONDS = 300; // 5 min
const HANDOFF_PREFIX = "vstr_handoff_";

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return Redis.fromEnv();
}

export async function POST(req: NextRequest) {
  // Rate-limit per IP — 10 handoffs / 5 min. Generous enough for a real
  // user who taps the button twice but tight enough that a stolen cookie
  // can't farm an army of bearers.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("auth:mobile-handoff", ip, 10, "5 m");
  const blocked = rateLimitResponse(rl, "Too many handoff requests. Try again in a few minutes.");
  if (blocked) return blocked;

  // Must be authenticated by iron-session cookie.
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    // Without Redis we can't enforce single-use semantics. Refuse rather
    // than fall back to an in-memory store (which wouldn't survive a cold
    // serverless boot anyway).
    return NextResponse.json(
      { error: "Mobile handoff temporarily unavailable" },
      { status: 503 },
    );
  }

  const user = await getUserByAddress(session.address);
  if (!user) {
    // Edge case: session cookie still valid but user row deleted.
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Mint the token and store its hash in Redis.
  const rand  = crypto.randomBytes(32).toString("hex");
  const token = `${HANDOFF_PREFIX}${rand}`;
  const hash  = hashValue(token);

  await redis.set(`mobile_handoff:${hash}`, user.id, {
    ex: HANDOFF_TTL_SECONDS,
  });

  // Build the deep link the client will encode into a QR / tap link.
  const deepLink = `vestream://auth?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    token,
    deepLink,
    expiresInSeconds: HANDOFF_TTL_SECONDS,
  });
}
