// src/app/api/calendar/[token]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY iCal feed path — preserved as a 308 (Permanent Redirect) to the
// canonical `/calendar/<token>.ics` URL.
//
// The route was originally hosted at `/api/calendar/<token>.ics` because
// it's an API route handler. UX testing surfaced that the masked URL on
// the settings page (`https://www.vestream.io/api/cale•••...`) read as
// "API" to non-technical users — making the calendar feature look like
// a developer integration. We moved the live feed to `/calendar/<token>.ics`
// so the masked preview now reads `https://www.vestream.io/calendar/...`,
// which is unambiguously about calendars.
//
// 308 (not 301) so calendar apps re-issue the same GET method on the new
// URL without rewriting POSTs into anything weird (defensive — calendar
// apps shouldn't POST here, but the spec's stronger).
//
// Existing subscribers (calendar apps that already polled the old URL)
// follow the redirect transparently. We can drop this shim once analytics
// show negligible traffic on the legacy path — review around 6 months
// post-deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  const target = `${url.origin}/calendar/${token}${url.search}`;
  return NextResponse.redirect(target, 308);
}
