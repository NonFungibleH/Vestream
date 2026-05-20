// POST → send a single sample push to the requesting user's
//        expoPushToken. Used by the "Test notification" button on
//        the mobile Alerts tab to let the user verify their alerts
//        wiring is intact (permissions granted, token registered,
//        Expo Push relay reachable) without waiting for a real
//        vesting event.
//
// 2026-05-20: introduced. Solves the "did I configure this right?"
// anxiety that previously generated support tickets when users set
// up alerts and then waited days for a real unlock event to verify.
//
// Push-credit accounting: a test push DOES NOT consume the user's
// monthly push credit. Reasoning: the test is the user proving
// alerts work, not the alert itself — counting it would punish
// users for diagnosing their own setup. The Expo Push service is
// rate-limited per token (well above any reasonable test cadence)
// so abuse isn't a real concern. We DO log a sentAt row in
// notifications_sent so the notification log surfaces the test
// alongside real alerts (with a synthetic streamId of "test").

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users, notificationsSent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendExpoPush } from "@/lib/notifications/push";

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read the user's currently-registered push token. If it's null
  // there's nothing to send to — surface that as a 400 so the mobile
  // client can hint the user to enable push permission.
  const [user] = await db
    .select({ expoPushToken: users.expoPushToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.expoPushToken) {
    return NextResponse.json(
      { error: "No push token registered. Enable push notifications first." },
      { status: 400 },
    );
  }

  // Fire the sample push. We don't await the Expo relay's
  // background delivery — a 2xx response from Expo just means it
  // accepted the message for delivery, which is the most we can
  // confirm synchronously. The mobile UI shows "sent" on 2xx; if
  // the push never arrives that's a device-side issue (e.g. user
  // toggled notifications off in System Settings).
  const result = await sendExpoPush({
    to:    user.expoPushToken,
    title: "Vestream test alert",
    body:  "Your alerts are wired up correctly. You'll receive real notifications like this for your tracked tokens.",
    data:  { test: true, url: "/(tabs)/alerts" },
  }).catch((err) => {
    console.error(`Test push send failed for user ${userId}:`, err);
    return { ok: false, error: "send failed" } as const;
  });

  // Log the test send so it appears in the notification log
  // alongside real alerts (mobile client can render it with a
  // "Test" badge based on the streamId sentinel).
  if (result.ok) {
    await db.insert(notificationsSent).values({
      userId,
      streamId:        "__test__",
      unlockTimestamp: new Date(),
    }).catch((err) => {
      // Non-fatal — the push went out, logging is incidental.
      console.error(`Failed to log test notification for ${userId}:`, err);
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "send failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
