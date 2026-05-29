// src/app/api/mobile/auth/email/route.ts
// POST { action: "send", email }     → sends OTP via Resend
// POST { action: "verify", email, code } → returns { token, user }
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { mobileOtps, pendingWalletLinks, wallets, users } from "@/lib/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
import { createMobileToken, hashValue } from "@/lib/mobile-auth";
import { upsertUser } from "@/lib/db/queries";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

// Wallet caps. May 2026 pricing simplification — free went 1 → 3, the
// "mobile" middle tier was retired so legacy mobile rows now get the
// same 10-wallet cap as pro for forward-compat through the transition.
// Kept inline here so the claim path doesn't need a second DB round-trip
// on a hot login path.
const WALLET_CAP: Record<string, number> = { free: 3, mobile: 10, pro: 10 };

/**
 * Claim every unclaimed pending_wallet_links row for this email and turn
 * each into a real row in the `wallets` table. Respects the user's tier
 * cap — claims up to (cap - existing) and leaves the rest in place so a
 * later tier upgrade can claim them on the user's next sign-in.
 *
 * Best-effort: claim failures are logged and swallowed; we never want a
 * pending-link issue to block a successful login.
 *
 * Returns the count actually claimed for analytics + future toast UX.
 */
async function claimPendingLinksForEmail(userId: string, email: string, tier: string): Promise<number> {
  try {
    const pending = await db
      .select()
      .from(pendingWalletLinks)
      .where(and(
        eq(pendingWalletLinks.email, email),
        isNull(pendingWalletLinks.claimedAt),
        gt(pendingWalletLinks.expiresAt, new Date()),
      ));
    if (pending.length === 0) return 0;

    // Existing wallets count — needed to enforce the cap.
    const existing = await db.select({ address: wallets.address }).from(wallets).where(eq(wallets.userId, userId));
    const existingAddrs = new Set(existing.map(w => w.address.toLowerCase()));
    const cap = WALLET_CAP[tier] ?? 1;
    const slotsLeft = Math.max(0, cap - existing.length);
    if (slotsLeft === 0) return 0;

    // Take up to `slotsLeft` pending links that aren't already in the
    // wallets table. Address comparison is lowercase for EVM; Solana
    // addresses stay as-is and dedupe via plain string compare.
    let claimed = 0;
    const claimedIds: string[] = [];
    for (const p of pending) {
      if (claimed >= slotsLeft) break;
      const key = p.walletAddress.startsWith("0x") ? p.walletAddress.toLowerCase() : p.walletAddress;
      if (existingAddrs.has(key)) {
        // Already-tracked wallet — mark claimed but don't double-insert.
        claimedIds.push(p.id);
        continue;
      }
      try {
        await db.insert(wallets).values({
          userId,
          address: p.walletAddress,
          label:   p.label ?? undefined,
          // pending_wallet_links stores chain_ids as JSONB number[]; wallets
          // table stores chains as text[]. Convert numbers → strings.
          chains:  p.chainIds && p.chainIds.length > 0 ? p.chainIds.map(String) : null,
        });
        existingAddrs.add(key);
        claimedIds.push(p.id);
        claimed++;
      } catch (insertErr) {
        // Could be a race condition / duplicate index violation. Log and
        // keep going so one bad row doesn't block the rest.
        console.error("[claim-pending] insert failed for", p.walletAddress, insertErr);
      }
    }

    if (claimedIds.length > 0) {
      // Mark every claimed row (including dupes) so subsequent logins
      // don't re-attempt. Drizzle's `inArray` isn't imported here to keep
      // the diff minimal; a per-id loop is cheap at this scale.
      const now = new Date();
      for (const id of claimedIds) {
        await db
          .update(pendingWalletLinks)
          .set({ claimedAt: now })
          .where(eq(pendingWalletLinks.id, id));
      }
    }

    return claimed;
  } catch (e) {
    console.error("[claim-pending] failed", e);
    return 0;
  }
}

/**
 * Cryptographically-secure 6-digit OTP. The verify path compares against a
 * SHA-256 hash via `eq(otpHash, hashValue(code))` — fixed-length and
 * inherently constant-time at the DB layer, so no timing-safe wrapper is
 * needed on the comparison.
 */
function generateOtp() {
  return randomInt(100000, 1000000).toString();
}

function otpEmailHtml(otp: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0f1e;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#111827;border-radius:20px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:28px 32px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:28px;height:28px;background:#1CB8B8;border-radius:7px;text-align:center;vertical-align:middle;">
                  <span style="font-size:15px;font-weight:900;color:white;line-height:28px;">T</span>
                </td>
                <td style="padding-left:10px;font-size:17px;font-weight:800;color:white;letter-spacing:-0.4px;">Vestream</td>
              </tr>
            </table>
            <p style="margin:16px 0 20px;font-size:13px;color:rgba(255,255,255,0.45);font-weight:500;">Token vesting tracker</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:white;letter-spacing:-0.4px;">Your sign-in code</p>
            <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.5;">
              Use this code to sign in to Vestream. It expires in 10 minutes.
            </p>

            <!-- OTP -->
            <div style="background:rgba(59,130,246,0.08);border:1.5px solid rgba(59,130,246,0.22);border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
              <span style="font-size:40px;font-weight:800;color:white;letter-spacing:10px;font-family:'Courier New',monospace;">${otp}</span>
            </div>

            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;">
              If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center;">
              Vestream · Track every unlock · <a href="https://www.vestream.io" style="color:rgba(255,255,255,0.35);text-decoration:none;">vestream.io</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, email: rawEmail, code } = body;
  const email = (rawEmail ?? "").toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // ── SEND ────────────────────────────────────────────────────────────────────
  if (action === "send") {
    // 2026-05-22: reviewer bypass. Apple App Review (and Google Play
    // pre-launch review) tests sign-in flows with whatever credentials
    // we provide in App Store Connect → App Review Information →
    // Demo Account. Reviewers don't have access to the demo email's
    // inbox, so a real email-OTP flow blocks them and the app gets
    // rejected for "App Completeness" (Guideline 2.1).
    //
    // The bypass: when env vars REVIEWER_EMAIL + REVIEWER_OTP are
    // BOTH set AND the incoming email matches REVIEWER_EMAIL, we
    // skip the Resend send (no real email goes out, no rate-limit
    // counter touched, no mobileOtps row inserted) and return 200.
    // The verify branch below independently accepts the matching
    // REVIEWER_OTP code for the same email.
    //
    // Safety:
    //   - Activates ONLY when both env vars are set. Misconfigure
    //     either and the bypass silently doesn't fire — real users
    //     still go through real OTP.
    //   - Tied to ONE specific email. Other addresses see no change.
    //   - Email comparison is lowercased + trimmed on both sides.
    const reviewerEmail = process.env.REVIEWER_EMAIL?.toLowerCase().trim();
    if (reviewerEmail && process.env.REVIEWER_OTP && email === reviewerEmail) {
      // No console log of the email — keeps reviewer's identity out of
      // log aggregators if the env var ever points at a real address.
      console.log("[Mobile OTP] reviewer send bypass — no email dispatched");
      return NextResponse.json({ ok: true });
    }

    // Rate limit: 5 OTP requests per email per hour
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("mobile:otp:send", `${ip}:${email}`, 5, "1 h");
    const blocked = rateLimitResponse(rl, "Too many attempts. Try again in an hour.");
    if (blocked) return blocked;

    const otp       = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Invalidate old OTPs for this email
    await db.delete(mobileOtps).where(eq(mobileOtps.email, email));
    await db.insert(mobileOtps).values({ email, otpHash: hashValue(otp), expiresAt });

    if (process.env.NODE_ENV !== "production") {
      // No email in the log — even though this branch is dev-only, a
      // mis-set NODE_ENV on a staging server would have leaked PII into
      // log aggregators. Just confirm the send happened.
      console.log("[Mobile OTP] code dispatched (check email or use DEV_OTP)");
    }

    if (!process.env.RESEND_API_KEY) {
      console.warn("[Mobile OTP] RESEND_API_KEY not set — email not sent");
      // Still succeed so DEV_OTP bypass works in testing
      return NextResponse.json({ ok: true });
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL;
    if (!fromAddress) {
      console.error("[Mobile OTP] RESEND_FROM_EMAIL not set — cannot send email");
      return NextResponse.json({ error: "Email sending not configured. Contact support." }, { status: 503 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from:    fromAddress,
      to:      email,
      subject: `${otp} is your Vestream code`,
      html:    otpEmailHtml(otp),
      text:    `Your Vestream sign-in code: ${otp}\n\nExpires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    });

    if (sendError) {
      console.error("[Mobile OTP] Resend error:", sendError);
      return NextResponse.json(
        { error: `Failed to send email: ${sendError.message}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  // ── VERIFY ──────────────────────────────────────────────────────────────────
  if (action === "verify") {
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

    // 2026-05-22: reviewer bypass — matches the send-branch bypass above.
    // When env vars REVIEWER_EMAIL + REVIEWER_OTP are BOTH set AND the
    // incoming (email, code) matches both exactly, we skip the rate-limit
    // check AND the DB OTP lookup and fall straight through to user creation.
    // The send branch already returned 200 without inserting a mobileOtps
    // row, so the regular lookup below would always miss anyway.
    //
    // IMPORTANT: This check must fire BEFORE the rate-limit, not after it.
    // Reviewers share IPs and test the same flow multiple times across
    // review sessions — they will exhaust a 5/15min bucket quickly. Putting
    // the rate-limit first means a 429 blocks them even with valid credentials
    // (exactly what happened in the 2026-05 App Store rejection / Guideline
    // 2.1 failure). The send path already follows this pattern (bypass first).
    //
    // Activates in production (intentional — Apple/Google reviewers test
    // the live binary). Confined to the one email by exact match.
    const reviewerEmail = process.env.REVIEWER_EMAIL?.toLowerCase().trim();
    const reviewerOtp   = process.env.REVIEWER_OTP;
    const isReviewer    = !!(reviewerEmail && reviewerOtp && email === reviewerEmail && code === reviewerOtp);

    // Rate-limit verify attempts: 5 per IP+email per 15 min.
    // Without this, a 6-digit OTP has ~1M combinations — a single IP could
    // brute-force the code space in seconds. Tightened from 10/15min
    // (audit hardening) — botnets can split attempts across IPs, but
    // tightening the per-IP-email cell raises the cost. The 10-min OTP
    // TTL is the harder ceiling; this just narrows the per-cell window.
    // Skipped entirely for reviewer credentials (see above).
    if (!isReviewer) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const rlVerify = await checkRateLimit("mobile:otp:verify", `${ip}:${email}`, 5, "15 m");
      const blocked = rateLimitResponse(rlVerify, "Too many verification attempts. Try again in 15 minutes.");
      if (blocked) return blocked;
    }

    const [row] = isReviewer ? [null] : await db
      .select()
      .from(mobileOtps)
      .where(and(
        eq(mobileOtps.email, email),
        eq(mobileOtps.otpHash, hashValue(code)),
        eq(mobileOtps.used, false),
        gt(mobileOtps.expiresAt, new Date()),
      ))
      .limit(1);

    // DEV_OTP bypass — development builds only, never active in production
    const devOtp = process.env.NODE_ENV !== "production" ? process.env.DEV_OTP : undefined;
    if (!isReviewer && !row && !(devOtp && code === devOtp)) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 422 });
    }

    if (row) {
      await db.update(mobileOtps).set({ used: true }).where(eq(mobileOtps.id, row.id));
    }

    const user  = await upsertUser(email);

    // Reviewer accounts always get Pro tier so Apple/Google reviewers
    // can exercise the full feature set without hitting IAP prompts or
    // free-tier wallet/alert caps. Runs as a simple UPDATE so it heals
    // on every sign-in — no one-time setup or manual DB intervention.
    if (isReviewer && user.tier !== "pro") {
      await db.update(users).set({ tier: "pro" }).where(eq(users.id, user.id));
      user.tier = "pro";
    }

    const token = await createMobileToken(user.id);

    // Web→mobile handoff: claim any wallets the user pre-saved via
    // /find-vestings → email-capture. Best-effort and non-blocking — a
    // failure here never prevents the user from signing in. The mobile
    // client's existing post-OTP wallet refetch will surface any newly
    // claimed rows automatically.
    const claimedWallets = await claimPendingLinksForEmail(user.id, email, user.tier ?? "free");

    return NextResponse.json({
      token,
      user: {
        id:                  user.id,
        email:               user.address,
        tier:                user.tier,
        userType:            user.userType,
        vestingCount:        user.vestingCount,
        currentTracking:     user.currentTracking,
        audienceCategory:    user.audienceCategory ?? null,
        onboardingCompleted: !!user.onboardingCompletedAt,
      },
      // Surface the count so the mobile client can optionally show a
      // "We found N wallets from your web search" toast on first portfolio
      // view. Field is omitted when zero so legacy clients ignore it.
      ...(claimedWallets > 0 ? { claimedWallets } : {}),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
