// POST → sets the user's IANA timezone (e.g. "Europe/London").
//
// 2026-05-20: introduced. Mobile detects the device's timezone via
// Intl.DateTimeFormat().resolvedOptions().timeZone on first launch
// of the new build (and on any subsequent launch where the
// detected value differs from the cached one) and POSTs it here.
// The backend stores it on users.timezone for use by:
//   - email notifications (formats unlock dates in user-local time)
//   - future daily-digest scheduler (fires at user's 9am local)
//   - future quiet-hours filter (suppresses overnight pushes)
//
// Body: { timezone: string | null }
//   - null  → clear the stored timezone (reverts formatters to UTC)
//   - other → must be a valid IANA timezone string. We validate by
//             round-tripping through Intl.DateTimeFormat — if the
//             constructor throws, we reject with 400.
//
// Returns: { timezone: string | null } reflecting the saved value.

import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Validate that a string is a usable IANA timezone identifier.
 *  Returns true when Intl can format a date with it, false otherwise.
 *  Catches everything from "Not/A/Zone" to "UTCsomething" the client
 *  might accidentally send. */
function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  if (tz.length > 60) return false;            // sanity cap
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const raw  = body?.timezone;

  let value: string | null;
  if (raw === null || raw === undefined || raw === "") {
    value = null;
  } else if (typeof raw === "string" && isValidTimezone(raw)) {
    value = raw;
  } else {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ timezone: value })
    .where(eq(users.id, userId));

  return NextResponse.json({ timezone: value });
}
