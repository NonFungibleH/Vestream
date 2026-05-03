// src/app/api/calendar/manage/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Authenticated calendar token management.
//
// Endpoints:
//   GET  → fetch (or lazily create) the user's current calendar token +
//          a ready-to-share subscribe URL
//   POST → rotate the token (e.g. user wants to revoke a leaked URL)
//
// The token is sensitive-ish — it grants read access to the user's
// upcoming-unlocks data (which is derivable from their tracked wallets
// anyway, but personalised). UI should warn before showing on a shared
// screen.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import {
  getUserByAddress,
  getOrCreateCalendarToken,
  rotateCalendarToken,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

async function resolveUserId(req: NextRequest): Promise<string | null> {
  try {
    const session = await getSession();
    if (session.address) {
      const user = await getUserByAddress(session.address);
      if (user) return user.id;
    }
  } catch { /* fall through */ }

  const token = extractBearerToken(req);
  if (token) {
    const userId = await validateMobileToken(token);
    if (userId) return userId;
  }
  return null;
}

/** Build the subscribe URL given the token. Pure helper, easy to unit-test. */
function buildSubscribeUrl(token: string, host: string): string {
  // Calendar apps often want both a `https://` URL (for browser preview)
  // and a `webcal://` URL (which auto-launches the calendar app on iOS /
  // macOS). Caller picks which to display; we return both.
  return `https://${host}/api/calendar/${token}.ics`;
}

function buildWebcalUrl(token: string, host: string): string {
  return `webcal://${host}/api/calendar/${token}.ics`;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await getOrCreateCalendarToken(userId);
  const host = req.headers.get("host") ?? "vestream.io";
  return NextResponse.json({
    token:         row.token,
    subscribeUrl:  buildSubscribeUrl(row.token, host),
    webcalUrl:     buildWebcalUrl(row.token, host),
    createdAt:     row.createdAt,
    lastFetchedAt: row.lastFetchedAt,
  });
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await rotateCalendarToken(userId);
  const host = req.headers.get("host") ?? "vestream.io";
  return NextResponse.json({
    token:         row.token,
    subscribeUrl:  buildSubscribeUrl(row.token, host),
    webcalUrl:     buildWebcalUrl(row.token, host),
    createdAt:     row.createdAt,
    lastFetchedAt: row.lastFetchedAt,
    rotated:       true,
  });
}
