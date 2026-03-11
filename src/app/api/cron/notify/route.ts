import { NextRequest, NextResponse } from "next/server";
import { runNotificationJob } from "@/lib/notifications/scheduler";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
