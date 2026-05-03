// /api/claims/export
// ─────────────────────────────────────────────────────────────────────────────
// CSV download endpoint for claim history. Wraps `buildClaimsCsv()` from
// lib/vesting/csv-exports.ts and serves the right Content-Type +
// Content-Disposition for browser-triggered downloads.
//
// GET /api/claims/export?format=vestream-generic
// GET /api/claims/export?format=koinly&since=2024-01-01&until=2024-12-31
//
// Auth via iron-session. Returns 401 if not signed in.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { getClaimHistoryForUser } from "@/lib/vesting/ingestors";
import { buildClaimsCsv, csvFilename, type ExportFormat } from "@/lib/vesting/csv-exports";
import { getStreamAnnotationsForUser, getStreamTagsForUser } from "@/lib/db/queries";

export const runtime = "nodejs";

const VALID_FORMATS = new Set<ExportFormat>([
  "vestream-generic",
  "koinly",
  "cointracker",
  "turbotax",
  "payroll-income",
  "payroll-summary-us",
  "payroll-summary-uk",
]);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  if (!u) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const sp        = req.nextUrl.searchParams;
  const formatRaw = (sp.get("format") ?? "vestream-generic") as ExportFormat;
  const format    = VALID_FORMATS.has(formatRaw) ? formatRaw : "vestream-generic";
  const since     = sp.get("since");
  const until     = sp.get("until");

  const events = await getClaimHistoryForUser(u.id, {
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
  });

  // Load the user's stream annotations + tags in parallel and build
  // O(1) lookup maps for the CSV builders. Most users have 0-10 of
  // each so both are cheap queries.
  const [annotationsList, tagsList] = await Promise.all([
    getStreamAnnotationsForUser(u.id),
    getStreamTagsForUser(u.id),
  ]);
  const annotationMap = new Map<string, { customName: string | null; notes: string | null }>();
  for (const a of annotationsList) {
    annotationMap.set(a.streamId, { customName: a.customName, notes: a.notes });
  }
  // Group tag rows by streamId so each stream produces a string[] in
  // the order the user added them. The DB returns them already-
  // lowercased; CSV builders pipe-join.
  const tagMap = new Map<string, string[]>();
  for (const t of tagsList) {
    const arr = tagMap.get(t.streamId) ?? [];
    arr.push(t.tag);
    tagMap.set(t.streamId, arr);
  }

  const csv = buildClaimsCsv(events, format, annotationMap, tagMap);

  // Year hints for the filename — pull from the actual data range so an
  // empty selection produces a sensible filename ("all-time").
  const sinceYear = since ? new Date(since).getUTCFullYear() : undefined;
  const untilYear = until ? new Date(until).getUTCFullYear() : undefined;
  const filename  = csvFilename(format, sinceYear, untilYear);

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // No-cache: claim history changes when ingestion runs; cached
      // downloads risk shipping stale data.
      "Cache-Control":       "no-store",
    },
  });
}
