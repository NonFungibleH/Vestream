/**
 * POST /api/developer/unlock
 *
 * Validates a B2B API key, sets vestr_api_access cookie containing the
 * key's UUID so /developer/account can look up usage stats.
 *
 * Body: { key: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { hashApiKey } from "@/lib/api-key-auth";
import { eq } from "drizzle-orm";

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
    .select({
      id:        apiKeys.id,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "API key not recognised." }, { status: 401 });
  }
  if (row.revokedAt) {
    return NextResponse.json({ error: "This API key has been revoked." }, { status: 403 });
  }

  // Store the key's UUID as the cookie value so /developer/account can
  // look up this specific user's usage without re-entering the key.
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vestr_api_access", row.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
