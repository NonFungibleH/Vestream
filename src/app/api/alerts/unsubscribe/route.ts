// One-click unsubscribe. GET so it works straight from an email client.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.redirect(new URL("/alerts/unsubscribed?ok=0", req.url));
  try {
    // Rows are marked, never deleted, so a later subscribe cannot re-spam
    // someone who opted out.
    await db.execute(sql`
      UPDATE wallet_alert_subscriptions
         SET unsubscribed_at = now()
       WHERE unsubscribe_token = ${token} AND unsubscribed_at IS NULL
    `);
  } catch (err) {
    console.error("[alerts/unsubscribe]", err);
    return NextResponse.redirect(new URL("/alerts/unsubscribed?ok=0", req.url));
  }
  return NextResponse.redirect(new URL("/alerts/unsubscribed?ok=1", req.url));
}
