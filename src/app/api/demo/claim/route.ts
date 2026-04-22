// src/app/api/demo/claim/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Claim all currently claimable tokens.
//   - Simulation: updates the withdrawn counter in the session cookie
//   - Sepolia:    broadcasts a VestingWallet.release(token) tx
// Rate-limited to 30 claims per IP per hour to stop obvious abuse.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { claimDemo } from "@/lib/demo";
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
  const rl = await checkRateLimit("demo-claim", getIp(req), 30, "1 h");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many claims. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  try {
    const session = await getDemoSession();
    if (!session.sessionId) {
      return NextResponse.json({ error: "No active demo session. Start one first." }, { status: 400 });
    }
    const state = await claimDemo(session);
    await session.save();
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error("POST /api/demo/claim error:", err);
    return NextResponse.json({ error: "Failed to claim" }, { status: 500 });
  }
}
