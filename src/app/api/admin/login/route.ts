import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { env } from "@/lib/env";

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

  // Store a non-trivial token in the cookie rather than just "1"
  const token = `vstr_admin_${Buffer.from(expected).toString("base64url").slice(0, 16)}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vestr_admin", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 8, // 8 hours
    path:     "/",
  });
  return res;
}
