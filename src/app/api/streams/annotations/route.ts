// src/app/api/streams/annotations/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bulk-fetch endpoint — returns ALL stream annotations for the authenticated
// user in one round-trip. Used by the dashboard so we don't fire one
// per-stream GET against `/api/streams/[streamId]/annotation` for every row
// in the vesting table.
//
// Response shape: { annotations: StreamAnnotation[] } — empty array when
// the user has never annotated anything. Client builds a Map<streamId,
// annotation> from this for O(1) lookup during render.
//
// Auth: same dual-auth pattern as the per-stream endpoint (web cookie OR
// mobile Bearer token).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { getUserByAddress, getStreamAnnotationsForUser } from "@/lib/db/queries";

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

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const annotations = await getStreamAnnotationsForUser(userId);
  return NextResponse.json({ annotations });
}
