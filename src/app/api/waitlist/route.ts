import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/ratelimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Get best available IP identifier from request headers (Vercel / Cloudflare)
function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??      // Cloudflare real IP
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  // ── Rate limit: 5 signups per IP per hour ─────────────────────────────────
  const ip = getIp(req);
  const rl = await checkRateLimit("waitlist", ip, 5, "1 h");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    await db
      .insert(waitlist)
      .values({ email: email.trim().toLowerCase() })
      .onConflictDoNothing();

    // Always return ok — no enumeration of existing emails
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/waitlist error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
