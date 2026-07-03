// src/lib/revenuecat-entitlements.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers for interpreting a RevenueCat v1 REST subscriber payload.
// Kept free of DB/env/network imports so the trust-boundary logic (does this
// user hold an ACTIVE paid entitlement?) is unit-testable in isolation.
// ─────────────────────────────────────────────────────────────────────────────

/** One entitlement as returned under subscriber.entitlements[key]. */
export interface RCEntitlement {
  /** ISO 8601 string, or null for a non-expiring (lifetime) grant. */
  expires_date?: string | null;
  product_identifier?: string;
}

export interface RCSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RCEntitlement>;
  };
}

/**
 * True when the subscriber holds at least one ACTIVE entitlement at `nowMs`.
 *
 * RevenueCat returns every entitlement ever granted — presence alone is not
 * "active", so each is checked against its expiry:
 *   • expires_date null      → lifetime grant → active
 *   • expires_date in future → active
 *   • expires_date in past   → lapsed → ignored
 *   • unparseable date       → treated as NOT active (fail closed)
 */
export function hasActiveEntitlement(
  entitlements: Record<string, RCEntitlement> | undefined,
  nowMs: number,
): boolean {
  if (!entitlements) return false;
  for (const ent of Object.values(entitlements)) {
    const exp = ent?.expires_date;
    if (exp === null || exp === undefined) return true; // lifetime
    const t = Date.parse(exp);
    if (Number.isFinite(t) && t > nowMs) return true;   // still in the future
  }
  return false;
}
