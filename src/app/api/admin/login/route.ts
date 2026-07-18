import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { env } from "@/lib/env";
import { createAdminToken, ADMIN_TOKEN_MAX_AGE_SEC } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  // Brute-force protection: 5 attempts per IP per 15 minutes
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("admin:login", ip, 5, "15 m");
  const blocked = rateLimitResponse(rl, "Too many attempts. Try again later.");
  if (blocked) return blocked;

  const { password } = await req.json().catch(() => ({}));
  const expected = env.ADMIN_PASSWORD;

  if (!password || !expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Timing-safe comparison prevents brute-force timing attacks
  const match =
    password.length === expected.length &&
    timingSafeEqual(Buffer.from(password), Buffer.from(expected));

  if (!match) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Signed, expiring HMAC token (see lib/admin-auth.ts) — one-way, so a cookie
  // leak no longer discloses the password prefix the old derivation exposed.
  const token = createAdminToken();

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vestr_admin", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    // `strict` — admin is the highest-value cookie surface. Cross-site
    // navigation should never transmit it (audit hardening).
    sameSite: "strict",
    maxAge:   ADMIN_TOKEN_MAX_AGE_SEC, // 8 hours — matches the token TTL
    path:     "/",
  });
  return res;
}
