import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { upsertUser } from "@/lib/db/queries";
import { Resend } from "resend";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

    // Log OTP to server console in all environments (useful in dev/staging)
    console.log(`[Vestream OTP] ${email} → ${otp}`);

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
    const devOtp = process.env.DEV_OTP;
    const codeMatches = session.otp === code || (devOtp && code === devOtp);
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
