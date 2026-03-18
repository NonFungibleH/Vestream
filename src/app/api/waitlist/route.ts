import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    await db
      .insert(waitlist)
      .values({ email: email.trim().toLowerCase() })
      .onConflictDoNothing();

    // Always return ok — no enumeration of existing emails
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/waitlist error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
