// src/app/api/demo/start/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Start a new 15-minute demo vesting session. Stateless from the server's
// perspective (apart from the signed cookie).
//
// Rate-limited to prevent abuse: 10 starts per IP per hour.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { startDemo } from "@/lib/demo";
import { getDemoSession } from "@/lib/demo/session";
import { checkRateLimit } from "@/lib/ratelimit";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit("demo-start", getIp(req), 10, "1 h");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many demo starts. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  try {
    const session = await getDemoSession();
    const state   = await startDemo(session);
    await session.save();
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error("POST /api/demo/start error:", err);
    return NextResponse.json({ error: "Failed to start demo" }, { status: 500 });
  }
}
