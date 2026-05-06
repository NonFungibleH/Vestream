// POST /api/auth/desktop-pair/init
//
// Step 1 of the QR-based desktop login flow. Called by the /login page
// when it loads, to mint a fresh pairing code that's then encoded as a
// QR for the user's mobile app to scan.
//
// Public endpoint — no auth required (the desktop browser hasn't logged
// in yet; that's the whole point). Rate-limited per IP so a hostile
// caller can't burn through Redis storage.
//
// Response:
//   { code: string, ttlSeconds: number }   — code is a UUIDv4, ttl=300
//   { error: "..." }                       — 503 on Redis-down, 429 on rate-limit

import { NextRequest, NextResponse } from "next/server";
import { createPairing } from "@/lib/auth/desktop-pair";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Rate limit: 30 inits per IP per minute. Plenty for a normal user
  // refreshing the page; tight enough to deter scripted abuse.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("desktop-pair:init", ip, 30, "1 m");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many pairing requests — wait a moment and reload." },
      { status: 429 }
    );
  }

  const code = await createPairing();
  if (!code) {
    return NextResponse.json(
      { error: "Pairing service unavailable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ code, ttlSeconds: 300 });
}
