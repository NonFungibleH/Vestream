// POST /api/developer/keys/revoke
// ─────────────────────────────────────────────────────────────────────────────
// Permanently revoke the caller's current API key. The user is signed out
// of the developer portal afterwards (cookie cleared) so they have to
// request a new key via /developer if they want to come back.
//
// Same auth pattern as /rotate — gated by the `vestr_api_access` cookie.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";

export async function POST() {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;
  if (!keyId) {
    return NextResponse.json({ error: "Sign in via /developer/portal first." }, { status: 401 });
  }

  // Idempotent: revoking an already-revoked key is a no-op.
  await db.update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId));

  // Clear the portal cookie. The user is now signed out and any
  // subsequent calls with the plaintext key get 401 from the API.
  cookieStore.set("vestr_api_access", "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   0,
  });

  return NextResponse.json({ ok: true, revoked: true });
}
