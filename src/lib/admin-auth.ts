import { type NextRequest } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";

// Admin session cookie — a signed, expiring token.
// ─────────────────────────────────────────────────────────────────────────────
// Previously the cookie value was `vstr_admin_${base64url(ADMIN_PASSWORD).slice(
// 0,16)}`. Those 16 base64url chars are the first 12 BYTES of the raw password —
// base64-decodable — so any cookie leak (proxy log, shared machine, backup) both
// granted persistent admin access AND disclosed the password prefix. The token
// was static (never rotated) and compared with `===` (not constant-time).
// (July 2026 audit, CTO security #2.)
//
// Now the cookie is `${exp}.${HMAC-SHA256(ADMIN_PASSWORD, "admin:"+exp)}`:
//   - one-way — the HMAC never reveals the password;
//   - self-expiring — `exp` is checked on every request (no server-side store);
//   - constant-time verified.
// Changing ADMIN_PASSWORD still invalidates every existing session, as before.
//
// NOTE: this changes the cookie FORMAT, so any current admin session is
// invalidated on deploy — sign in again at /admin/login.
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours — matches the cookie maxAge

function sign(exp: number, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`admin:${exp}`).digest("base64url");
}

/** Mint a fresh admin session token. Called by the /admin/login route. */
export function createAdminToken(): string {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(exp, env.ADMIN_PASSWORD ?? "")}`;
}

/** Seconds until an admin token expires — use for the cookie maxAge. */
export const ADMIN_TOKEN_MAX_AGE_SEC = Math.floor(TTL_MS / 1000);

/** Validate a cookie value: correct signature AND not expired. Constant-time. */
export function isValidAdminToken(value: string | undefined): boolean {
  const secret = env.ADMIN_PASSWORD;
  if (!secret || !value) return false;

  const dot = value.indexOf(".");
  if (dot <= 0) return false;

  const exp = Number(value.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const provided = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(exp, secret));
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/** Validate the admin session cookie on an incoming request. */
export function isAdminAuthorized(req: NextRequest): boolean {
  return isValidAdminToken(req.cookies.get("vestr_admin")?.value);
}
