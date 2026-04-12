// src/app/api/mobile/auth/email/route.ts
// POST { action: "send", email }  → sends OTP via Resend
// POST { action: "verify", email, code }  → returns { token, user }
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { mobileOtps } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createMobileToken, hashValue } from "@/lib/mobile-auth";
import { upsertUser } from "@/lib/db/queries";

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, email: rawEmail, code } = body;
  const email = (rawEmail ?? "").toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  if (action === "send") {
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Invalidate old OTPs for this email
    await db.delete(mobileOtps).where(eq(mobileOtps.email, email));

    await db.insert(mobileOtps).values({
      email,
      otpHash:   hashValue(otp),
      expiresAt,
    });

    console.log(`[Mobile OTP] ${email} → ${otp}`);

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@vestr.xyz",
        to: email,
        subject: `Your Vestream code: ${otp}`,
        text: `Your Vestream sign-in code: ${otp}\n\nExpires in 10 minutes.`,
      }).catch((err) => console.error("Resend error:", err));
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

    const [row] = await db.select()
      .from(mobileOtps)
      .where(and(
        eq(mobileOtps.email, email),
        eq(mobileOtps.otpHash, hashValue(code)),
        eq(mobileOtps.used, false),
        gt(mobileOtps.expiresAt, new Date()),
      ))
      .limit(1);

    // Allow DEV_OTP bypass
    const devOtp = process.env.DEV_OTP;
    if (!row && !(devOtp && code === devOtp)) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 422 });
    }

    if (row) {
      await db.update(mobileOtps).set({ used: true }).where(eq(mobileOtps.id, row.id));
    }

    const user = await upsertUser(email);
    const token = await createMobileToken(user.id);

    return NextResponse.json({
      token,
      user: {
        id:                   user.id,
        email:                user.address,
        tier:                 user.tier,
        userType:             user.userType,
        vestingCount:         user.vestingCount,
        currentTracking:      user.currentTracking,
        onboardingCompleted:  !!user.onboardingCompletedAt,
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// Suppress unused import warning — crypto is used via hashValue which calls it internally
void crypto;
