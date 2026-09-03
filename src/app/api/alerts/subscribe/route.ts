// src/app/api/alerts/subscribe/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Subscribe an email to unlock alerts for one wallet. No account, no wallet
// connection, no app install — this is the consumer-layer promise delivered on
// the web.
//
// Deliberately NOT the same thing as /api/find-vestings/save-link: that route
// stores an install-attribution token and the visitor receives nothing until
// they install the app. This route creates a real subscription that the notify
// cron will act on.
//
// Abuse posture: someone can type an address that is not theirs. Mitigated by
// the same rate limit shape as save-link, a prominent one-click unsubscribe in
// every email, and keeping unsubscribed rows forever so a re-subscribe cannot
// be used to re-spam someone who opted out. Single opt-in rather than
// double: the first email is itself the value (what we found + when it
// unlocks), which is the lower-friction read of a user-initiated action.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { walletAlertSubscriptions } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { checkCors } from "@/lib/cors";
import { normaliseEmail, isDisposableEmail } from "@/lib/email-validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const corsError = checkCors(req);
  if (corsError) return corsError;

  let body: { email?: string; walletAddress?: string; hoursBefore?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = normaliseEmail(body.email ?? "");
  const raw   = (body.walletAddress ?? "").trim();

  if (!email || isDisposableEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!raw || !isValidWalletAddress(raw)) {
    return NextResponse.json({ error: "That doesn't look like a wallet address." }, { status: 400 });
  }
  // EVM lowercased, Solana base58 preserved — never lowercase a Solana address.
  const walletAddress = normaliseAddress(raw);

  // 1h / 24h / 72h only; anything else falls back to a day's notice.
  const allowed = new Set([1, 24, 72]);
  const hoursBefore = allowed.has(Number(body.hoursBefore)) ? Number(body.hoursBefore) : 24;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("alerts:subscribe", `${ip}:${email}`, 20, "1 h");
  const blocked = rateLimitResponse(rl, "Too many alert sign-ups. Try again later.");
  if (blocked) return blocked;

  const token = randomBytes(24).toString("hex");

  try {
    // Re-subscribing updates in place, but does NOT resurrect a row the
    // recipient unsubscribed from — opting out is permanent unless they use a
    // fresh address, which is the safer default for a public form.
    await db.execute(sql`
      INSERT INTO wallet_alert_subscriptions (email, wallet_address, hours_before, unsubscribe_token)
      VALUES (${email}, ${walletAddress}, ${hoursBefore}, ${token})
      ON CONFLICT (lower(email), wallet_address) DO UPDATE
        SET hours_before = EXCLUDED.hours_before
        WHERE wallet_alert_subscriptions.unsubscribed_at IS NULL
    `);
  } catch (err) {
    console.error("[alerts/subscribe]", err);
    return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hoursBefore });
}
