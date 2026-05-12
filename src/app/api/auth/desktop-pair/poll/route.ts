// GET /api/auth/desktop-pair/poll?code=…
//
// Step 3 of the QR-based desktop login flow. The desktop browser
// repeatedly polls this route while showing the QR. Three terminal
// outcomes:
//
//   { status: "waiting" }    — keep polling (200)
//   { status: "confirmed" }  — sets the iron-session cookie + returns 200
//                              with a redirect target. Code is consumed
//                              (deleted) atomically here; second poll
//                              with same code returns "expired".
//   { status: "expired" }    — TTL passed or already consumed (410).
//                              Caller should ask the user to start over.
//
// Pairing TTL is 5 minutes (lib/auth/desktop-pair.ts). Recommend the
// client polls every 2s; that's 150 polls per pairing, well within
// Vercel function quotas.

import { NextRequest, NextResponse } from "next/server";
import { getPairing, consumePairing } from "@/lib/auth/desktop-pair";
import { getSession } from "@/lib/auth/session";
import { upsertUser } from "@/lib/db/queries";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // Rate-limit: 200 polls per IP per 5 min. Legitimate desktop polls at 2s
  // intervals over a 5-min code TTL = 150 polls max. 200 is comfortably
  // above that but blocks a UUID-known attacker from poll-flooding the
  // Redis backend. UUIDs are 122 bits of entropy so guessing one is
  // intractable anyway; this just removes the route from "no rate limit"
  // audit findings.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("desktop-pair:poll", ip, 200, "5 m");
  const blocked = rateLimitResponse(rl, "Too many poll requests. Refresh the page.");
  if (blocked) return blocked;

  // Cheap pre-read to avoid hitting getdel on every poll (would burn
  // Redis ops). Most polls land here in "waiting" state and just return
  // immediately.
  const peek = await getPairing(code);
  if (!peek) {
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }
  if (peek.status === "waiting") {
    return NextResponse.json({ status: "waiting" });
  }

  // status === "confirmed" — atomically consume so a second poll can't
  // re-use the code. consumePairing uses Redis GETDEL.
  const consumed = await consumePairing(code);
  if (!consumed || consumed.status !== "confirmed" || !consumed.address) {
    // Race: between peek and consume something else cleaned the entry.
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  // Mirror the OTP-verify flow: upsert the user (idempotent — lower-cases
  // address inside) and stamp the address into the iron-session cookie.
  // From here on the desktop has the same auth surface as the legacy OTP
  // path, including dashboard / explorer / saved-search access (gated by
  // `users.tier === "pro"` server-side).
  await upsertUser(consumed.address);
  const session = await getSession();
  session.address = consumed.address;
  await session.save();

  return NextResponse.json({
    status:   "confirmed",
    redirect: "/dashboard",
  });
}
