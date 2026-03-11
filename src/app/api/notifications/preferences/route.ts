import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getUserByAddress,
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "@/lib/db/queries";

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
