/**
 * POST /api/developer/unlock
 *
 * Validates a B2B API key and sets vestr_api_access cookie.
 * This lets approved developers access /api-docs without the
 * consumer early-access code.
 *
 * Body: { key: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { hashApiKey } from "@/lib/api-key-auth";
import { eq, isNull } from "drizzle-orm";

export async function POST(req: NextRequest) {
  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { key } = body;
  if (!key || typeof key !== "string" || !key.startsWith("vstr_live_")) {
    return NextResponse.json({ error: "Invalid API key format." }, { status: 400 });
  }

  const hash = hashApiKey(key.trim());

  const [row] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "API key not recognised." }, { status: 401 });
  }

  // Check not revoked
  const [full] = await db
    .select({ revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.id, row.id))
    .limit(1);

  if (full?.revokedAt) {
    return NextResponse.json({ error: "This API key has been revoked." }, { status: 403 });
  }

  // Set api access cookie — 30 day session
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vestr_api_access", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
