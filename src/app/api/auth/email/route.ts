import { NextRequest, NextResponse } from "next/server";
import { randomInt, timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { upsertUser } from "@/lib/db/queries";
import { Resend } from "resend";
import { checkRateLimit } from "@/lib/ratelimit";

/**
 * Cryptographically-secure 6-digit OTP. `randomInt(min, max)` matches
 * `Math.floor(min + Math.random() * (max-min))` numerically but uses the
 * OS CSPRNG instead of the predictable Mersenne Twister behind Math.random.
 */
function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * Constant-time comparison of two strings. Returns false immediately on
 * length mismatch (timingSafeEqual throws if buffers differ in length, and
 * the length itself is not a secret here — both operands are 6-digit OTPs).
 */
function safeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function otpEmailHtml(otp: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:white;border-radius:20px;border:1px solid #e5e7eb;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">

        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:30px;height:30px;background:linear-gradient(135deg,#1CB8B8,#0F8A8A);border-radius:8px;text-align:center;vertical-align:middle;">
                  <span style="font-size:14px;font-weight:900;color:white;line-height:30px;">T</span>
                </td>
                <td style="padding-left:10px;font-size:16px;font-weight:800;color:#1A1D20;letter-spacing:-0.4px;">Vestream</td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1D20;letter-spacing:-0.4px;">Your sign-in code</p>
            <p style="margin:0 0 28px;font-size:15px;color:#8B8E92;line-height:1.5;">
              Use this code to sign in to Vestream. It expires in 10 minutes.
            </p>

            <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:24px;text-align:center;margin-bottom:28px;">
              <span style="font-size:40px;font-weight:800;color:#1CB8B8;letter-spacing:10px;font-family:'Courier New',monospace;">${otp}</span>
            </div>

            <p style="margin:0;font-size:13px;color:#B8BABD;line-height:1.6;">
              If you didn't request this code, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 20px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:11px;color:#B8BABD;text-align:center;">
              Vestream · Track every unlock · <a href="https://www.vestream.io" style="color:#B8BABD;text-decoration:none;">vestream.io</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// POST /api/auth/email   { action: "send", email }   → sends OTP
// POST /api/auth/email   { action: "verify", email, code }  → verifies OTP, creates session
export async function POST(req: NextRequest) {
  let body: { action?: string; email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { action } = body;

  if (action === "send") {
    const email = (body.email ?? "").toLowerCase().trim();
    if (!email || !email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Rate limit: 5 OTP send attempts per email per hour
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("auth:otp:send", `${ip}:${email}`, 5, "1 h");
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again in an hour." }, { status: 429 });
    }

    const otp = generateOtp();
    let session;
    try {
      session = await getSession();
    } catch (err) {
      console.error("getSession failed in email send:", err);
      return NextResponse.json({ error: "Auth service unavailable. Check SESSION_SECRET env var." }, { status: 500 });
    }
    session.otp = otp;
    session.otpEmail = email;
    session.otpExpiry = Math.floor(Date.now() / 1000) + 600; // 10 min
    await session.save();

    // In development, log a hint — never log the actual OTP value in any environment
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Vestream OTP] code sent to ${email} (check email or use DEV_OTP)`);
    }

    if (process.env.RESEND_API_KEY) {
      const fromAddress = process.env.RESEND_FROM_EMAIL;
      if (!fromAddress) {
        console.error("[Auth OTP] RESEND_FROM_EMAIL not set — cannot send email");
        return NextResponse.json({ error: "Email sending not configured. Contact support." }, { status: 503 });
      }
      const resend = new Resend(process.env.RESEND_API_KEY);
      try {
        await resend.emails.send({
          from:    fromAddress,
          to:      email,
          subject: `${otp} is your Vestream code`,
          html:    otpEmailHtml(otp),
          text:    `Your Vestream sign-in code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
        });
      } catch (err) {
        console.error("Failed to send OTP email:", err);
        return NextResponse.json({ error: "Failed to send email. Try again." }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    const email = (body.email ?? "").toLowerCase().trim();
    const code  = (body.code  ?? "").trim();

    // Rate-limit verify attempts: 10 per IP+email per 15 min.
    // Without this, a 6-digit OTP has ~1M combinations — brute-forcing from a
    // single IP is trivial without any rate limit on the verify path.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = await checkRateLimit("auth:otp:verify", `${ip}:${email}`, 10, "15 m");
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Try again in 15 minutes." },
        { status: 429 }
      );
    }

    let session;
    try {
      session = await getSession();
    } catch (err) {
      console.error("getSession failed in email verify:", err);
      return NextResponse.json({ error: "Auth service unavailable." }, { status: 500 });
    }

    if (!session.otp || !session.otpEmail || !session.otpExpiry) {
      return NextResponse.json({ error: "No sign-in code requested. Please start over." }, { status: 422 });
    }
    if (session.otpEmail !== email) {
      return NextResponse.json({ error: "Email mismatch. Please start over." }, { status: 422 });
    }
    if (Math.floor(Date.now() / 1000) > session.otpExpiry) {
      return NextResponse.json({ error: "Code expired. Please request a new one." }, { status: 422 });
    }
    const devOtp = process.env.NODE_ENV !== "production" ? process.env.DEV_OTP : undefined;
    // Timing-safe comparison: a `===` on a 6-digit string can leak which
    // characters matched via per-byte short-circuit timing differences. The
    // search space (10^6) is small enough for that to matter.
    const codeMatches =
      safeEqualStr(session.otp, code) ||
      (devOtp ? safeEqualStr(code, devOtp) : false);
    if (!codeMatches) {
      return NextResponse.json({ error: "Incorrect code. Please try again." }, { status: 422 });
    }

    // Valid — create/fetch user (non-fatal if DB unavailable)
    try {
      await upsertUser(email);
    } catch (err) {
      console.error("DB error in email verify (non-fatal):", err);
    }

    session.otp       = undefined;
    session.otpEmail  = undefined;
    session.otpExpiry = undefined;
    session.address   = email;
    await session.save();

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
