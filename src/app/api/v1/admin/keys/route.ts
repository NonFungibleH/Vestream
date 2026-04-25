/**
 * POST /api/v1/admin/keys
 *
 * Issues a new API key. Protected by ADMIN_API_SECRET (admin-only).
 * The plaintext key is returned ONCE — it is never stored.
 *
 * Auth note: this used to share CRON_SECRET. We split them so a leaked
 * cron token (e.g. via Vercel cron-misconfig) can't be turned into a key
 * minting / listing privilege escalation.
 *
 * Body: {
 *   email:        string   (required)
 *   name?:        string
 *   tier?:        "free" | "pro"
 *   monthlyLimit?: number  (default: 1000 free / 100000 pro)
 *   notes?:       string
 * }
 *
 * Example curl:
 *   curl -X POST https://vestream.io/api/v1/admin/keys \
 *     -H "Authorization: Bearer <ADMIN_API_SECRET>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"partner@example.com","name":"Example Co","tier":"pro"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/api-key-auth";
import { env } from "@/lib/env";

const DEFAULT_LIMITS: Record<string, number> = {
  free: 1_000,
  pro:  100_000,
};

/**
 * Constant-time bearer-token check. Rejects early on length mismatch so
 * the underlying timingSafeEqual never sees buffers of differing lengths
 * (which would throw). The token length itself is not secret.
 */
function isAuthorized(authHeader: string | null): boolean {
  const expected = env.ADMIN_API_SECRET;
  if (!expected) {
    // Fail closed — admin routes should never serve traffic without an
    // explicit secret configured.
    console.error("[admin/keys] ADMIN_API_SECRET not set — rejecting all requests");
    return false;
  }
  if (!authHeader) return false;

  const expectedHeader = `Bearer ${expected}`;
  if (authHeader.length !== expectedHeader.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expectedHeader));
}

export async function POST(req: NextRequest) {
  // Admin auth — separate secret from CRON_SECRET (see file header).
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; name?: string; tier?: string; monthlyLimit?: number; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const tier  = body.tier === "pro" ? "pro" : "free";
  const limit = body.monthlyLimit ?? DEFAULT_LIMITS[tier];

  // Generate key — plaintext only lives in this response
  const plaintext = generateApiKey();
  const hash      = hashApiKey(plaintext);
  const prefix    = plaintext.slice(0, 17); // "vstr_live_" + 7 chars

  await db.insert(apiKeys).values({
    keyHash:      hash,
    keyPrefix:    prefix,
    ownerEmail:   body.email.trim().toLowerCase(),
    ownerName:    body.name ?? null,
    tier,
    monthlyLimit: limit,
    notes:        body.notes ?? null,
  });

  return NextResponse.json({
    ok:      true,
    key:     plaintext,   // ← shown ONCE, never retrievable again
    prefix,
    tier,
    monthly_limit: limit,
    warning: "Save this key immediately — it cannot be retrieved again.",
  });
}

/**
 * GET /api/v1/admin/keys  — list all keys (admin only, no plaintext)
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id:           apiKeys.id,
      prefix:       apiKeys.keyPrefix,
      ownerEmail:   apiKeys.ownerEmail,
      ownerName:    apiKeys.ownerName,
      tier:         apiKeys.tier,
      monthlyLimit: apiKeys.monthlyLimit,
      usageThisMonth: apiKeys.usageThisMonth,
      lastUsedAt:   apiKeys.lastUsedAt,
      revokedAt:    apiKeys.revokedAt,
      createdAt:    apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(apiKeys.createdAt);

  return NextResponse.json({ keys: rows });
}
