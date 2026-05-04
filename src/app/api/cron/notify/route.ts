import { NextRequest, NextResponse } from "next/server";
import { runNotificationJob } from "@/lib/notifications/scheduler";
import { env } from "@/lib/env";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";

// Notification job runs the full upcoming-unlocks scan + emails every eligible
// user. Needs more than the default 10s Vercel function timeout.
export const maxDuration = 300;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  // Constant-time bearer comparison — prevents the (theoretical) timing
  // side-channel that `!==` would expose. Same pattern across every cron
  // route + the RevenueCat webhook for consistency.
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notified = await runNotificationJob();
    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    console.error("Cron notification job failed:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron invokes via GET; manual triggers / legacy callers may POST.
export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
