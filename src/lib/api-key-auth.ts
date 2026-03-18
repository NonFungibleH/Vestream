/**
 * API key authentication for the public /api/v1/* endpoints.
 *
 * Key format:  vstr_live_{64 hex chars}   (e.g. vstr_live_a1b2c3...)
 * Storage:     Only SHA-256(key) is stored in the DB — plaintext is never persisted.
 * Auth header: Authorization: Bearer vstr_live_...
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// ─── Key generation (admin use only) ─────────────────────────────────────────

/** Generates a new plaintext API key. Call once, return to user, never store. */
export function generateApiKey(): string {
  const random = crypto.randomBytes(32).toString("hex"); // 64 hex chars
  return `vstr_live_${random}`;
}

/** SHA-256 hash of a plaintext key — what we store in the DB. */
export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

// ─── Authentication ───────────────────────────────────────────────────────────

export interface AuthResult {
  ok:      true;
  keyId:   string;
  tier:    string;
  limit:   number;
  usage:   number;
}

export interface AuthError {
  ok:      false;
  status:  number;
  message: string;
}

/**
 * Validates the Bearer token in the Authorization header.
 * Updates last_used_at and resets monthly usage counter if needed.
 * Returns AuthResult on success, AuthError on failure.
 */
export async function authenticateApiKey(
  req: NextRequest
): Promise<AuthResult | AuthError> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer vstr_live_")) {
    return {
      ok:      false,
      status:  401,
      message: "Missing or invalid Authorization header. Expected: Bearer vstr_live_...",
    };
  }

  const plaintext = authHeader.slice(7); // strip "Bearer "
  const hash      = hashApiKey(plaintext);

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  if (!row) {
    return { ok: false, status: 401, message: "Invalid API key." };
  }

  if (row.revokedAt) {
    return { ok: false, status: 401, message: "This API key has been revoked." };
  }

  // Reset monthly usage counter if we've rolled into a new month
  const now       = new Date();
  const monthStart = row.usageMonthStart;
  const sameMonth =
    now.getFullYear() === monthStart.getFullYear() &&
    now.getMonth()    === monthStart.getMonth();

  const currentUsage = sameMonth ? row.usageThisMonth : 0;

  if (currentUsage >= row.monthlyLimit) {
    return {
      ok:      false,
      status:  429,
      message: `Monthly limit of ${row.monthlyLimit} requests reached. Upgrade to Pro for higher limits.`,
    };
  }

  // Update usage + last_used_at (fire-and-forget — don't block response)
  void db
    .update(apiKeys)
    .set({
      lastUsedAt:      now,
      usageThisMonth:  currentUsage + 1,
      usageMonthStart: sameMonth ? monthStart : now,
    })
    .where(eq(apiKeys.id, row.id));

  return {
    ok:    true,
    keyId: row.id,
    tier:  row.tier,
    limit: row.monthlyLimit,
    usage: currentUsage + 1,
  };
}

// ─── Response helpers ─────────────────────────────────────────────────────────

/** Wraps an auth error into a standard NextResponse. */
export function authErrorResponse(err: AuthError): NextResponse {
  return NextResponse.json(
    { error: err.message, docs: "https://vestream.io/api-docs" },
    { status: err.status }
  );
}

/** Adds standard rate limit headers to a response. */
export function withRateLimitHeaders(
  res: NextResponse,
  auth: AuthResult
): NextResponse {
  res.headers.set("X-RateLimit-Limit",     String(auth.limit));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, auth.limit - auth.usage)));
  res.headers.set("X-RateLimit-Reset",     getMonthResetTimestamp());
  return res;
}

function getMonthResetTimestamp(): string {
  const now   = new Date();
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return String(Math.floor(reset.getTime() / 1000));
}
