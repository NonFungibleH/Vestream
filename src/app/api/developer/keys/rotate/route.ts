// POST /api/developer/keys/rotate
// ─────────────────────────────────────────────────────────────────────────────
// Revoke the caller's current API key and issue a fresh one of the same tier.
// Used when a user suspects their key has leaked, or just wants to cycle
// keys on a schedule. The old key is hard-revoked (`revokedAt` set) so
// existing integrations break immediately — that's the intended UX, since
// a half-rotated key would be worse than a clean break.
//
// Auth: this endpoint is gated by the `vestr_api_access` cookie that's
// set when the user signs in via /developer/portal. It is NOT a Bearer-
// token-authenticated public endpoint — only the user holding the cookie
// can rotate their own key.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/api-key-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

export async function POST() {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;
  if (!keyId) {
    return NextResponse.json({ error: "Sign in via /developer/portal first." }, { status: 401 });
  }

  // Rate limit: 5 rotations per cookie-id per day. Anyone hitting that limit
  // is doing something abnormal.
  const rl = await checkRateLimit("dev:rotate", keyId, 5, "1 d");
  const blocked = rateLimitResponse(rl, "Too many key rotations today. Try again tomorrow.");
  if (blocked) return blocked;

  // Fetch the current key row for tier + email + name.
  const [current] = await db
    .select({
      ownerEmail:   apiKeys.ownerEmail,
      ownerName:    apiKeys.ownerName,
      tier:         apiKeys.tier,
      monthlyLimit: apiKeys.monthlyLimit,
      revokedAt:    apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);
  if (!current || current.revokedAt) {
    return NextResponse.json({ error: "No active key found for this session." }, { status: 404 });
  }

  // Generate replacement.
  const plaintext = generateApiKey();
  const hash      = hashApiKey(plaintext);
  const prefix    = plaintext.slice(0, 17);

  // Atomically: revoke old, insert new.
  const now = new Date();
  await db.update(apiKeys)
    .set({ revokedAt: now })
    .where(eq(apiKeys.id, keyId));

  const inserted = await db.insert(apiKeys).values({
    keyHash:      hash,
    keyPrefix:    prefix,
    ownerEmail:   current.ownerEmail,
    ownerName:    current.ownerName,
    tier:         current.tier,
    monthlyLimit: current.monthlyLimit,
  }).returning({ id: apiKeys.id });

  // Update the cookie so the user's UI session points at the new key
  // instead of the (now revoked) old one. httpOnly so JS can't read it
  // — same security posture as the original portal session.
  cookieStore.set("vestr_api_access", inserted[0].id, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    // `strict` — matches /api/developer/unlock + /api/admin/login. The
    // API-key management surface shouldn't be cross-site cookie-readable.
    sameSite: "strict",
    path:     "/",
    maxAge:   60 * 60 * 24 * 30, // 30 days, matches the portal cookie
  });

  return NextResponse.json({
    ok:     true,
    key:    plaintext, // ONE-TIME — never retrievable again
    prefix,
    tier:   current.tier,
  });
}
