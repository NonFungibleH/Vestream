// src/lib/search-log.ts
//
// Single-call helper for logging wallet searches across every surface
// (public /find-vestings scan, mobile portfolio search, dashboard
// Token Vesting Explorer, wallet add). One row per search lands in
// `wallet_searches` and powers the search-activity panels on
// /admin/growth.
//
// PII posture: walletAddress is public on-chain data (stored plaintext).
// IPs and emails are sha256-hashed with APP_SECRET so we can dedup
// anonymous searchers and tie pre-signup searches to post-signup users
// without storing raw PII.
//
// All calls are fire-and-forget — search logging never blocks the
// user-visible response or causes a route to fail. Errors are caught
// silently. Worst-case loss is a single missing search row, which we
// can live with.

import crypto from "crypto";
import { db } from "./db";
import { walletSearches } from "./db/schema";

export type SearchSource =
  | "find_vestings"      // public /find-vestings page (anonymous or email-capture)
  | "mobile_search"      // mobile in-app search box
  | "mobile_track"       // mobile user added a wallet to their portfolio
  | "dashboard_discover";// web Token Vesting Explorer

interface LogOpts {
  walletAddress: string;
  chainId?:      number | null;
  userId?:       string | null;
  source:        SearchSource;
  ip?:           string | null;
  email?:        string | null;
}

/** sha256(value + APP_SECRET) — deterministic hash for dedup/cohort
 *  matching without storing raw PII. APP_SECRET falls back to a
 *  build-time constant on dev so missing env vars don't crash the route. */
function hashWithSecret(value: string): string {
  const secret = process.env.APP_SECRET ?? "vestream-dev-search-hash";
  return crypto
    .createHash("sha256")
    .update(value + secret)
    .digest("hex");
}

/** Normalise a wallet address for consistent grouping in the admin
 *  dashboard. EVM addresses lowercased; Solana addresses are
 *  case-sensitive (base58) so they pass through as-is. */
function normalizeAddress(addr: string): string {
  if (addr.startsWith("0x") && addr.length === 42) return addr.toLowerCase();
  return addr;
}

/** Log one wallet search. Fire-and-forget; never throws. */
export function logWalletSearch(opts: LogOpts): void {
  // Don't await — the response shouldn't wait on this insert. Errors are
  // swallowed so a momentary DB blip doesn't take down the search route.
  db.insert(walletSearches)
    .values({
      walletAddress: normalizeAddress(opts.walletAddress),
      chainId:       opts.chainId ?? null,
      userId:        opts.userId ?? null,
      source:        opts.source,
      ipHash:        opts.ip ? hashWithSecret(opts.ip) : null,
      emailHash:     opts.email ? hashWithSecret(opts.email.toLowerCase().trim()) : null,
    })
    .catch((err) => {
      // Best-effort logging; only surfaced in server logs so we can spot
      // sustained DB failures, never propagated to the caller.
      console.warn("[search-log] insert failed:", err?.message ?? err);
    });
}

/** Extract the client IP from common Vercel/edge headers. Returns null
 *  when none are available (e.g. server-internal calls). */
export function extractClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim() || null;
  return null;
}
