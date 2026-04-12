/**
 * POST /api/admin/revoke
 *
 * Admin-cookie-protected endpoint that sets revokedAt on an API key.
 *
 * Body: { keyId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAdminAuthorized } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { keyId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { keyId } = body;
  if (!keyId || typeof keyId !== "string") {
    return NextResponse.json({ error: "keyId is required" }, { status: 400 });
  }

  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
    .returning({ id: apiKeys.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
