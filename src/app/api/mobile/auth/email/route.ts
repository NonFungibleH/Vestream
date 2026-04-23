// src/app/api/mobile/auth/email/route.ts
// POST { action: "send", email }     → sends OTP via Resend
// POST { action: "verify", email, code } → returns { token, user }
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { mobileOtps } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createMobileToken, hashValue } from "@/lib/mobile-auth";
import { upsertUser } from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/ratelimit";

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
                <td style="width:28px;height:28px;background:#3b82f6;border-radius:7px;text-align:center;vertical-align:middle;">
                  <span style="font-size:15px;font-weight:900;color:white;line-height:28px;">V</span>
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
    // Rate limit: 5 OTP requests per email per hour
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("mobile:otp:send", `${ip}:${email}`, 5, "1 h");
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
    }

    const otp       = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Invalidate old OTPs for this email
    await db.delete(mobileOtps).where(eq(mobileOtps.email, email));
    await db.insert(mobileOtps).values({ email, otpHash: hashValue(otp), expiresAt });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[Mobile OTP] code sent to ${email} (check email or use DEV_OTP)`);
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

    // Rate-limit verify attempts: 10 per IP+email per 15 min.
    // Without this, a 6-digit OTP has ~1M combinations — a single IP could
    // brute-force the code space in seconds.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rlVerify = await checkRateLimit("mobile:otp:verify", `${ip}:${email}`, 10, "15 m");
    if (!rlVerify.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    const [row] = await db
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
    if (!row && !(devOtp && code === devOtp)) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 422 });
    }

    if (row) {
      await db.update(mobileOtps).set({ used: true }).where(eq(mobileOtps.id, row.id));
    }

    const user  = await upsertUser(email);
    const token = await createMobileToken(user.id);

    return NextResponse.json({
      token,
      user: {
        id:                  user.id,
        email:               user.address,
        tier:                user.tier,
        userType:            user.userType,
        vestingCount:        user.vestingCount,
        currentTracking:     user.currentTracking,
        onboardingCompleted: !!user.onboardingCompletedAt,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
