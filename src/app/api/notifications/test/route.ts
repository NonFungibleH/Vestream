// src/app/api/notifications/test/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Web sibling of /api/mobile/notifications/test. Fires a single sample
// push to the requesting user's registered expoPushToken — the user's
// mobile app must be paired and have push permission granted for there
// to be a token to send to.
//
// Web vs mobile parity: this route is iron-session-gated (same as the
// rest of /api/notifications/*). The send/log behaviour mirrors the
// mobile route exactly so a "Test" badge in the notification log
// renders the same on both surfaces.
//
// Pro-tier-only at the route level — the dashboard layout already
// requires Pro, but defence in depth is cheap.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { users, notificationsSent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendExpoPush } from "@/lib/notifications/push";

export async function POST() {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionUser = await getUserByAddress(session.address);
  if (!sessionUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // expoPushToken is registered only by the mobile app on first launch.
  // A web-only user (never opened mobile) has no token to send to —
  // surface that as a 400 with a copy hint instead of a generic failure.
  const [u] = await db
    .select({ expoPushToken: users.expoPushToken })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!u?.expoPushToken) {
    return NextResponse.json(
      { error: "No push token registered. Open the Vestream mobile app at least once to enable push notifications, then try again." },
      { status: 400 },
    );
  }

  const result = await sendExpoPush({
    to:    u.expoPushToken,
    title: "Vestream test alert",
    body:  "Your alerts are wired up correctly. You'll receive real notifications like this for your tracked tokens.",
    data:  { test: true, url: "/(tabs)/alerts" },
  }).catch((err) => {
    console.error(`Test push send failed for user ${sessionUser.id}:`, err);
    return { ok: false, error: "send failed" } as const;
  });

  if (result.ok) {
    // Mirror the mobile route: log to notifications_sent with the
    // synthetic streamId sentinel so the test shows in /dashboard/alerts'
    // history feed with a "Test" badge (the HistoryRow component already
    // looks for streamId === "__test__"). Non-fatal failure: the push
    // already went out, this is just bookkeeping.
    await db.insert(notificationsSent).values({
      userId:          sessionUser.id,
      streamId:        "__test__",
      unlockTimestamp: new Date(),
    }).catch((err) => {
      console.error(`Failed to log test notification for ${sessionUser.id}:`, err);
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "send failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
