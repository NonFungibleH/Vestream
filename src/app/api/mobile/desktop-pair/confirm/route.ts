// POST /api/mobile/desktop-pair/confirm
//
// Step 2 of the QR-based desktop login flow. Called by the mobile app's
// "Connect Desktop" feature after the user has scanned a QR code.
//
// Auth: bearer token (same pattern as every /api/mobile/* route). The
// userId behind the token tells us who's confirming.
//
// Tier gate: only "pro" users can pair a desktop — the dashboard is the
// thing they're paying for. Mobile- and Free-tier users get a 403 with
// an upsell payload so the app can show the right "Upgrade to Pro"
// screen.
//
// Body: { code: string }   — UUID from the QR
// Returns:
//   200 { ok: true }                                — paired successfully
//   400 { error: "Missing code" | "Invalid code" }  — malformed input
//   401 { error: "Unauthorized" }                   — no/bad bearer
//   403 { error: "Pro plan required", requiredTier: "pro" }
//   404 { error: "User not found" }
//   410 { error: "Code expired" }                   — QR went stale
//   503 { error: "Pairing service unavailable" }    — Redis down

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken, getMobileUser } from "@/lib/mobile-auth";
import { confirmPairing } from "@/lib/auth/desktop-pair";
import { canAccessDashboard, normaliseTier } from "@/lib/auth/tier";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 1. Bearer auth — identifies the mobile user.
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getMobileUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // 2. Tier gate — Pro only. The mobile UI should already hide the
  //    "Connect Desktop" button for non-Pro users; this is the
  //    server-side enforcement that catches anyone calling the
  //    endpoint directly.
  const tier = normaliseTier(user.tier);
  if (!canAccessDashboard(tier)) {
    return NextResponse.json(
      {
        error:        "Pro plan required to access the desktop dashboard.",
        requiredTier: "pro",
        currentTier:  tier,
      },
      { status: 403 }
    );
  }

  // 3. Parse body.
  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = body?.code?.trim();
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // 4. Mark the pairing confirmed in Redis with the user's address.
  //    The desktop's poll route picks this up on its next tick and
  //    sets its iron-session cookie.
  const result = await confirmPairing(code, user.address);
  if (result === "expired") {
    return NextResponse.json({ error: "Code expired — show a new QR on the desktop." }, { status: 410 });
  }
  if (result === false) {
    return NextResponse.json({ error: "Pairing service unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
