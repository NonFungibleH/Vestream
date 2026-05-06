// Desktop pairing — QR-based login flow for the Pro-tier dashboard.
//
// Three actors:
//   1. Desktop browser visits /login. Calls POST /api/auth/desktop-pair/init
//      which creates a pairing code (UUID) and stores `{status:"waiting"}`
//      in Upstash Redis with a 5-min TTL. Desktop renders the code as a
//      QR image and starts polling.
//   2. User opens the mobile app → Settings → "Connect Desktop". Camera
//      scans the QR. App calls POST /api/mobile/desktop-pair/confirm with
//      its bearer token + the pairing code. Server checks the user's tier
//      is "pro" (the only tier with dashboard access), looks up their
//      address (email/wallet — same value used as the iron-session
//      identifier), and writes `{status:"confirmed", address}` into Redis.
//   3. Desktop's poll picks up the confirmation. The poll route reads the
//      address out of Redis, sets the iron-session cookie via
//      session.save(), DELETES the Redis entry (one-time use), and returns
//      success. Desktop redirects to /dashboard.
//
// Why Redis-backed and not a DB table:
//   - 5-minute TTL is native to Redis and self-expiring; a table would
//     need a janitor cron.
//   - One-time use is cheap with `getdel`.
//   - No migration overhead for what's an ephemeral handshake artefact.
//
// If Redis is misconfigured (UPSTASH env vars missing) all three endpoints
// return 503; QR pairing is hard-required infra, not best-effort.

import { Redis } from "@upstash/redis";

const PAIRING_TTL_SECONDS = 5 * 60;
const REDIS_KEY_PREFIX     = "desktop-pair:";

export interface PairingState {
  status:   "waiting" | "confirmed";
  /** User's address (email or wallet) — the iron-session identifier we
   *  set after the desktop poll picks up a confirmed pairing. Only
   *  populated once `status === "confirmed"`. */
  address?: string;
  /** Unix-seconds timestamp of original creation, for telemetry. */
  createdAt: number;
}

let cachedRedis: Redis | null = null;

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  try {
    cachedRedis = Redis.fromEnv();
    return cachedRedis;
  } catch (err) {
    console.error("[desktop-pair] Redis init failed:", err);
    return null;
  }
}

/**
 * Create a fresh pairing entry. Returns the code (UUID) the caller should
 * encode into the QR. Returns null if Redis is unavailable.
 */
export async function createPairing(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  const code = crypto.randomUUID();
  const state: PairingState = {
    status:    "waiting",
    createdAt: Math.floor(Date.now() / 1000),
  };
  try {
    await redis.set(REDIS_KEY_PREFIX + code, state, { ex: PAIRING_TTL_SECONDS });
    return code;
  } catch (err) {
    console.error("[desktop-pair] createPairing set failed:", err);
    return null;
  }
}

/**
 * Read a pairing's current state. Returns null if not found (expired or
 * never existed) or if Redis is down. Used by the desktop poll route to
 * decide whether to keep polling, log the user in, or give up.
 *
 * Does NOT delete the entry — that's the poll route's job once it's
 * actually consumed the address.
 */
export async function getPairing(code: string): Promise<PairingState | null> {
  const redis = getRedis();
  if (!redis) return null;
  if (!isLikelyUuid(code)) return null;
  try {
    return await redis.get<PairingState>(REDIS_KEY_PREFIX + code);
  } catch (err) {
    console.error("[desktop-pair] getPairing read failed:", err);
    return null;
  }
}

/**
 * Mark a pairing confirmed by writing the user's address into Redis.
 * Called by the mobile app's confirm endpoint after it has verified the
 * user is on the Pro tier.
 *
 * Returns:
 *   - true   on success
 *   - "expired"  if the code is no longer in Redis (TTL passed or already consumed)
 *   - false  on Redis errors / bad input
 */
export async function confirmPairing(
  code:    string,
  address: string,
): Promise<true | "expired" | false> {
  const redis = getRedis();
  if (!redis) return false;
  if (!isLikelyUuid(code) || !address) return false;

  try {
    const existing = await redis.get<PairingState>(REDIS_KEY_PREFIX + code);
    if (!existing) return "expired";

    const updated: PairingState = {
      ...existing,
      status:  "confirmed",
      address: address.toLowerCase(),
    };
    // Preserve remaining TTL — poll has a short grace window to pick this
    // up. Using `keepTtl` means the entry expires even if nobody polls.
    await redis.set(REDIS_KEY_PREFIX + code, updated, { keepTtl: true });
    return true;
  } catch (err) {
    console.error("[desktop-pair] confirmPairing failed:", err);
    return false;
  }
}

/**
 * Atomically read + delete a confirmed pairing. The desktop poll route
 * calls this after receiving a confirmed status — single-use semantics
 * mean a leaked QR can't be replayed after the user has already logged
 * in once. Returns the consumed PairingState or null.
 */
export async function consumePairing(code: string): Promise<PairingState | null> {
  const redis = getRedis();
  if (!redis) return null;
  if (!isLikelyUuid(code)) return null;
  try {
    return await redis.getdel<PairingState>(REDIS_KEY_PREFIX + code);
  } catch (err) {
    console.error("[desktop-pair] consumePairing failed:", err);
    return null;
  }
}

/** Defence-in-depth: reject obviously malformed codes before hitting Redis. */
function isLikelyUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
