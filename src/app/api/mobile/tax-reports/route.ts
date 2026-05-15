// src/app/api/mobile/tax-reports/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// List the user's persisted tax-export files.
//
// Each row in tax_report_files is a copy of a CSV that the user generated
// on the web dashboard at /dashboard/exports. The mobile Tax Reports
// screen renders this list as "Koinly · 23 KB · 14 May" cards — tap a
// row to fetch the actual CSV body via /api/mobile/tax-reports/[id].
//
// We DON'T return the CSV content here — that would balloon the list
// payload for users who've generated dozens of reports. Metadata only;
// content fetched on demand.
//
// Auth: mobile bearer.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { taxReportFiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export interface TaxReportListItem {
  id:          string;
  format:      string;
  filename:    string;
  sizeBytes:   number;
  rowCount:    number;
  sinceDate:   string | null;
  untilDate:   string | null;
  generatedAt: string;
}

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Cap at 100 — generous enough for any realistic user history,
  // bounded so the screen stays performant even if cleanup-cron lapses.
  const rows = await db
    .select({
      id:          taxReportFiles.id,
      format:      taxReportFiles.format,
      filename:    taxReportFiles.filename,
      sizeBytes:   taxReportFiles.sizeBytes,
      rowCount:    taxReportFiles.rowCount,
      sinceDate:   taxReportFiles.sinceDate,
      untilDate:   taxReportFiles.untilDate,
      generatedAt: taxReportFiles.generatedAt,
    })
    .from(taxReportFiles)
    .where(eq(taxReportFiles.userId, userId))
    .orderBy(desc(taxReportFiles.generatedAt))
    .limit(100);

  const reports: TaxReportListItem[] = rows.map((r) => ({
    id:          r.id,
    format:      r.format,
    filename:    r.filename,
    sizeBytes:   r.sizeBytes,
    rowCount:    r.rowCount,
    sinceDate:   r.sinceDate?.toISOString() ?? null,
    untilDate:   r.untilDate?.toISOString() ?? null,
    generatedAt: r.generatedAt.toISOString(),
  }));

  return NextResponse.json({ reports });
}
