// src/app/api/mobile/tax-reports/[id]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fetch a specific tax-report file's CSV content. The mobile screen calls
// this when the user taps a row in the Tax Reports list — the resulting
// CSV is handed to expo-sharing for the iOS share sheet, so the user can
// email it or save to Files.
//
// Returns the CSV body with text/csv Content-Type + Content-Disposition,
// matching the web /api/claims/export response shape so a future Pro user
// downloading via mobile browser also gets a sensible filename.
//
// Auth: mobile bearer. Always scoped to the user's own reports — a
// stranger's UUID returns 404, not "Unauthorized" (don't leak existence).
//
// Also supports DELETE for the user to clean up their own history.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { taxReportFiles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // UUID validation — saves a DB roundtrip on malformed input.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [row] = await db
    .select({
      filename: taxReportFiles.filename,
      content:  taxReportFiles.content,
    })
    .from(taxReportFiles)
    .where(and(eq(taxReportFiles.id, id), eq(taxReportFiles.userId, userId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(row.content, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${row.filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await db
    .delete(taxReportFiles)
    .where(and(eq(taxReportFiles.id, id), eq(taxReportFiles.userId, userId)))
    .returning({ id: taxReportFiles.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
