import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getUserByAddress,
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "@/lib/db/queries";

// Minimal RFC-shape email regex. Not a full RFC 5322 parser — that's neither
// possible nor desirable in a regex — but rejects whitespace, missing @, and
// missing TLD, which catches the realistic broken-input cases. Length cap is
// 254 chars per RFC 5321 (the practical SMTP limit).
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;

export async function GET() {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByAddress(session.address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const prefs = await getNotificationPreferences(user.id);
  return NextResponse.json({ preferences: prefs ?? null });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByAddress(session.address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { emailEnabled, email, hoursBeforeUnlock, notifyCliff, notifyStreamEnd, notifyMonthly } = await req.json();

  const validHours = [1, 6, 12, 24, 48, 72];
  if (hoursBeforeUnlock !== undefined && !validHours.includes(hoursBeforeUnlock)) {
    return NextResponse.json({ error: "Invalid hoursBeforeUnlock" }, { status: 400 });
  }

  // Validate email format — without this the route stored arbitrary user
  // input (newlines, header injection vectors, junk strings) directly into
  // a column the cron mailer later passes to Resend.
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
  }

  const update: Parameters<typeof upsertNotificationPreferences>[1] = {};
  if (emailEnabled !== undefined) update.emailEnabled = emailEnabled;
  if (email !== undefined) update.email = email;
  if (hoursBeforeUnlock !== undefined) update.hoursBeforeUnlock = hoursBeforeUnlock;
  if (notifyCliff !== undefined) update.notifyCliff = notifyCliff;
  if (notifyStreamEnd !== undefined) update.notifyStreamEnd = notifyStreamEnd;
  if (notifyMonthly !== undefined) update.notifyMonthly = notifyMonthly;

  const prefs = await upsertNotificationPreferences(user.id, update);
  return NextResponse.json({ preferences: prefs });
}
