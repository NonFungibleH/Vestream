// GET  → returns current notification preferences
// POST → saves notification preferences
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { notificationPreferences, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select({ address: users.address }).from(users).where(eq(users.id, userId)).limit(1);
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);

  return NextResponse.json({
    prefs: prefs ?? {
      emailEnabled:       false,
      email:              user?.address ?? null,
      hoursBeforeUnlock:  24,
      notifyCliff:        true,
      notifyStreamEnd:    true,
      notifyMonthly:      false,
    },
  });
}

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    emailEnabled      = false,
    email,
    hoursBeforeUnlock = 24,
    notifyCliff       = true,
    notifyStreamEnd   = true,
    notifyMonthly     = false,
  } = body;

  const [existing] = await db.select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing) {
    await db.update(notificationPreferences)
      .set({ emailEnabled, email, hoursBeforeUnlock, notifyCliff, notifyStreamEnd, notifyMonthly, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences)
      .values({ userId, emailEnabled, email, hoursBeforeUnlock, notifyCliff, notifyStreamEnd, notifyMonthly });
  }

  return NextResponse.json({ ok: true });
}
