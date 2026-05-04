// src/app/api/calendar/[token]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public iCal feed endpoint. URL is `/api/calendar/{vstr_cal_*}.ics` —
// the token IS the auth, so calendar apps can subscribe without sending
// cookies/bearer tokens.
//
// Cached at the edge for 30 min. Calendar apps poll on their own schedule
// (Google ~24h, Apple ~5min when in foreground), so 30-min freshness is
// fine and dramatically reduces our DB load even if a user has 50 calendar
// clients across devices.
//
// Token validation lives in db/queries.ts (findUserByCalendarToken) so the
// schema reference + hash semantics stay co-located.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { findUserByCalendarToken, touchCalendarToken } from "@/lib/db/queries";
import { generateCalendarFeed } from "@/lib/vesting/calendar-ics";

export const dynamic = "force-dynamic";

// Token format: `vstr_cal_{32 hex chars}` = 9 + 64 = 73 chars total.
// May arrive with `.ics` suffix appended by the calendar app — strip it.
const TOKEN_RE = /^vstr_cal_[0-9a-f]{64}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken).replace(/\.ics$/i, "");

  if (!TOKEN_RE.test(token)) {
    return new NextResponse("Invalid calendar token", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const found = await findUserByCalendarToken(token);
  if (!found) {
    // 404 not 401 — calendar apps don't handle auth challenges; just look
    // unsubscribed if the token's been rotated/revoked.
    return new NextResponse("Calendar feed not found", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Bump lastFetchedAt — fire-and-forget so we never block the response.
  // Useful diagnostic for "is the user actually subscribed?".
  touchCalendarToken(found.userId).catch(() => {});

  let body: string;
  try {
    body = await generateCalendarFeed(found.userId);
  } catch (err) {
    console.error(`[calendar/${token.slice(0, 16)}…] feed generation failed:`, err);
    // Return a minimal valid empty calendar rather than 500 — keeps the
    // user's subscription "alive" in their calendar app even when our DB
    // hiccups. Better UX than the calendar showing red error states.
    body =
      "BEGIN:VCALENDAR\r\n" +
      "VERSION:2.0\r\n" +
      "PRODID:-//Vestream//Token Vesting Calendar//EN\r\n" +
      "X-WR-CALNAME:Vestream — Token unlocks\r\n" +
      "END:VCALENDAR\r\n";
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":  "text/calendar; charset=utf-8",
      // 30-min edge cache. Apple Calendar respects the REFRESH-INTERVAL
      // hint inside the body (PT6H); Google polls on its own ~24h cadence.
      // Edge cache protects DB regardless.
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      // Suggest a friendly filename on download (most apps ignore).
      "Content-Disposition": `inline; filename="vestream-unlocks.ics"`,
    },
  });
}
