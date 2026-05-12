// src/lib/email-validation.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared email validation + normalization for every public email-capture
// endpoint (/waitlist, /contact, /feedback, /find-vestings/save-link,
// /api-access, /mobile/auth/email).
//
// Two helpers:
//   normaliseEmail(raw)  — lowercase, trim, strip trailing dot, return null
//                          if the result fails the canonical EMAIL_RE
//   isDisposableEmail(e) — true if the email's domain is on the
//                          disposable-mailbox blocklist
//
// Why these belong in one file: every endpoint was doing its own slightly
// different version of `email.trim().toLowerCase()`, and a typo in any
// one of them was an enumeration / dedup leak. One source of truth.
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical email regex used across every public endpoint. Catches "@",
 *  "user@", "@example.com", and other trivially-malformed addresses.
 *  Intentionally not the full RFC 5322 monster — that regex has known
 *  ReDoS classes and rejects perfectly valid addresses anyway. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Disposable / temporary-mailbox domains. Submissions from these get a
 * polite 400 rather than a saved pending row + Resend send.
 *
 * Kept small and high-signal — the goal is to bounce automated abuse,
 * not to be exhaustive. Real users who type a typo'd legit address get
 * through; users who type "@mailinator.com" are signalling they don't
 * want to convert anyway, so we save them and ourselves a round-trip.
 *
 * To extend: add a domain in lowercase. The check is exact-match on the
 * final hostname so subdomains don't auto-block (e.g. blocking
 * "tempmail.com" doesn't block "mail.tempmail.com.example.com").
 */
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "fakeinbox.com",
  "sharklasers.com",
  "getairmail.com",
  "dispostable.com",
  "maildrop.cc",
  "mintemail.com",
  "mohmal.com",
  "mailnesia.com",
]);

/**
 * Normalise an email for storage + dedup. Returns null if the input
 * fails the EMAIL_RE shape check after normalisation.
 *
 * Normalisations applied:
 *  - trim whitespace
 *  - lowercase (case-insensitive comparison for storage keys)
 *  - strip trailing dot ("user@example.com." → "user@example.com")
 *
 * NOT applied:
 *  - "+extension" stripping (e.g. "user+tag@example.com" → "user@example.com").
 *    Some users intentionally use + tags to track signups across services;
 *    folding them would dedup conflict legitimate distinct submissions
 *    and reveal aliasing across surfaces.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let e = raw.trim().toLowerCase();
  if (e.endsWith(".")) e = e.slice(0, -1);
  if (e.length === 0 || e.length > 254) return null;
  if (!EMAIL_RE.test(e)) return null;
  return e;
}

/**
 * Returns true if the email's domain is on the disposable blocklist.
 * Call AFTER normaliseEmail (expects a lowercased, validated address).
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1);
  return DISPOSABLE_DOMAINS.has(domain);
}
