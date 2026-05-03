// src/app/api/streams/tags/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bulk-fetch endpoint — returns ALL tags across ALL of the user's streams in
// one round-trip. Used by the dashboard to populate the filter chip bar +
// per-row pills without N per-stream fetches.
//
// Mirrors /api/streams/annotations (bulk shape). Same dual-auth pattern.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { getUserByAddress, getStreamTagsForUser } from "@/lib/db/queries";

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
  const tags = await getStreamTagsForUser(userId);
  return NextResponse.json({ tags });
}
