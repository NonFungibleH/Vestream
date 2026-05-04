// src/lib/auth/timing-safe-bearer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Constant-time `Authorization: Bearer <secret>` comparison helper.
//
// Used by every route protected by a static shared secret (cron jobs,
// admin API endpoints, internal webhooks) so that a timing-side-channel
// attack on the secret value isn't mathematically possible.
//
// `===` / `!==` compare strings character-by-character with early exit:
// in theory, an attacker measuring sub-microsecond response-time deltas
// could observe how many leading characters match and grind out the
// secret one byte at a time. Our cron secrets are ~30 chars of high
// entropy — astronomically infeasible to crack via timing — but reusing
// the strict pattern keeps us off the OWASP audit checklist forever.
//
// Pattern matches the RevenueCat-webhook helper in
// /api/mobile/revenuecat-webhook/route.ts (kept inline there because the
// route was first to need it). Now extracted so cron routes use the
// same primitive.
// ─────────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from "node:crypto";

/**
 * Validate a request's `Authorization` header against a `Bearer ${secret}`
 * payload. Returns true iff the header is present and matches in
 * constant time. Length-mismatch short-circuits because `timingSafeEqual`
 * throws on differing-length buffers — that's not a useful side channel
 * (the attacker can already see the response is fast in that case), so
 * the early-return is fine.
 */
export function bearerEquals(authHeader: string | null | undefined, secret: string): boolean {
  if (!authHeader || !secret) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
