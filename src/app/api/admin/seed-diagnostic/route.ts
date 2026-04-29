// src/app/api/admin/seed-diagnostic/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-protocol seed diagnostic. Runs the same discovery + adapter-fetch
// pipeline the cron uses, but for ONE protocol on ONE chain at a time, and
// reports exactly what happened at every stage:
//
//   1. Did discovery find any recipient wallets?
//   2. If yes, did the read-side adapter successfully fetch their streams?
//   3. If not, what error was thrown?
//
// Built specifically because PinkSale "has never shown data" in production
// despite the seeder being wired up correctly. The cron runs nightly with
// no per-protocol instrumentation, so failures get swallowed silently — a
// classic blind-debugging trap. This endpoint replaces guessing with
// ground-truth.
//
// Usage:
//   curl -H "Cookie: vestr_admin=<token>" \
//     "https://vestream.io/api/admin/seed-diagnostic?protocol=pinksale&chain=56"
//
//   { protocol: "pinksale", chain: 56, recipients: 47,
//     sampleStreams: [...], duration: { discovery: 4200, fetch: 1800 },
//     errors: [], rpcUrl: "alchemy" }
//
// Returns up to 10 sample streams from the first 5 recipients. Honest
// trade-off: this isn't the full seed (which would write thousands of
// rows + take 60s+) — it's a fast end-to-end check to prove the wiring
// works AND to surface what's actually populating the cache.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters";
import { CHAIN_IDS, type SupportedChainId } from "@/lib/vesting/types";
import type { VestingStream } from "@/lib/vesting/types";
import { env } from "@/lib/env";

function getAdapter(id: string) {
  return ADAPTER_REGISTRY.find((a) => a.id === id);
}

/**
 * Accept either the admin cookie OR the CRON_SECRET Bearer header for this
 * diagnostic. The cookie path is the canonical admin auth (same gate as
 * /admin/*). The Bearer path lets ops invoke this from a terminal without
 * the cookie-extraction dance — same secret already used by the cron jobs,
 * so anyone with shell access to the Vercel env already has it.
 */
function isAuthorized(req: NextRequest): boolean {
  if (isAdminAuthorized(req)) return true;
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) return true;
  return false;
}

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// Mirror of the discoverers wired into the seeder. We deliberately don't
// import the seeder's discoverer registry directly because (a) it's not
// exported and (b) keeping the import surface small here prevents the
// seeder's heavy module graph from being pulled into this lambda. We only
// need the discoverer for the protocol the caller asked about.
async function loadDiscoverer(
  protocol: string,
): Promise<((chainId: SupportedChainId, limit: number) => Promise<string[]>) | null> {
  // Dynamic import keeps cold-start fast for the common-case admin checks.
  const seeder = await import("@/lib/vesting/seeder");
  // The seeder doesn't export individual discoverers; its discoverer
  // registry isn't exposed either. To keep this diagnostic genuinely
  // testing what the cron tests, we use the public `seedAll` path with
  // a custom filter — but that runs ALL protocols. Instead, re-export the
  // per-protocol discoverers we need. If a future seeder refactor exports
  // a registry, switch to that.
  const registry: Record<string, unknown> = seeder as unknown as Record<string, unknown>;
  const fnName = {
    "pinksale":     "discoverPinksaleRecipients",
    "uncx-vm":      "discoverUncxVmRecipients",
    "streamflow":   "discoverStreamflowRecipients",
    "jupiter-lock": "discoverJupiterLockRecipients",
  }[protocol];
  if (!fnName) return null;
  const fn = registry[fnName];
  if (typeof fn !== "function") return null;
  return fn as (chainId: SupportedChainId, limit: number) => Promise<string[]>;
}

interface DiagnosticResult {
  protocol:     string;
  chainId:      number;
  recipients:   number;
  sampleStreams: number;
  duration: {
    discoveryMs: number;
    fetchMs:     number;
  };
  recipientSample:    string[];
  streamSample:       Array<{ id: string; tokenSymbol: string; recipient: string }>;
  errors:             Array<{ stage: string; message: string }>;
  envVars: {
    cronSecret:        boolean;
    graphApiKey:       boolean;
    rpcEthereum:       boolean;
    rpcBsc:            boolean;
    rpcPolygon:        boolean;
    rpcBase:           boolean;
    rpcSolana:         boolean;
    solanaEnabled:     boolean;
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const protocol = req.nextUrl.searchParams.get("protocol") ?? "";
  const chainStr = req.nextUrl.searchParams.get("chain") ?? "";
  const chainId  = Number.parseInt(chainStr, 10) as SupportedChainId;

  if (!protocol) {
    return NextResponse.json({ error: "?protocol=<id> required (e.g. pinksale)" }, { status: 400 });
  }
  if (!Number.isFinite(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "?chain=<id> required (e.g. 56 for BSC)" }, { status: 400 });
  }

  const errors: DiagnosticResult["errors"] = [];

  // Stage 1 — discovery.
  let recipients: string[] = [];
  const discoveryStart = Date.now();
  try {
    const discover = await loadDiscoverer(protocol);
    if (!discover) {
      // Subgraph-based protocols don't have explicit discoverers in the
      // registry — they're discovered via subgraph paginated queries
      // inside seedAll. Tell the user this protocol uses a different
      // mechanism instead of failing silently.
      return NextResponse.json({
        error: `Protocol '${protocol}' uses subgraph discovery, not event-scan. This diagnostic covers only event-scan protocols (pinksale, uncx-vm, streamflow, jupiter-lock). Check the subgraph URL config in env for subgraph-based protocols.`,
      }, { status: 400 });
    }
    recipients = await discover(chainId, 50);
  } catch (err) {
    errors.push({
      stage:   "discovery",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const discoveryMs = Date.now() - discoveryStart;

  // Stage 2 — fetch streams for the first 5 recipients via the read-side
  // adapter. We sample rather than full-fetch so this endpoint stays under
  // the 60s lambda timeout even on slow chains.
  let streams: Array<{ id: string; tokenSymbol: string; recipient: string }> = [];
  const fetchStart = Date.now();
  if (recipients.length > 0) {
    try {
      const adapter = getAdapter(protocol);
      if (!adapter) {
        errors.push({
          stage:   "fetch",
          message: `No adapter registered for protocol '${protocol}'`,
        });
      } else {
        const fetched = await adapter.fetch(recipients.slice(0, 5), chainId);
        streams = fetched.slice(0, 10).map((s: VestingStream) => ({
          id:          s.id,
          tokenSymbol: s.tokenSymbol,
          recipient:   s.recipient,
        }));
      }
    } catch (err) {
      errors.push({
        stage:   "fetch",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const fetchMs = Date.now() - fetchStart;

  const result: DiagnosticResult = {
    protocol,
    chainId,
    recipients:    recipients.length,
    sampleStreams: streams.length,
    duration: {
      discoveryMs,
      fetchMs,
    },
    recipientSample: recipients.slice(0, 5),
    streamSample:    streams,
    errors,
    envVars: {
      cronSecret:    !!process.env.CRON_SECRET,
      graphApiKey:   !!process.env.GRAPH_API_KEY,
      rpcEthereum:   !!process.env.ALCHEMY_RPC_URL_ETH,
      rpcBsc:        !!process.env.BSC_RPC_URL,
      rpcPolygon:    !!process.env.POLYGON_RPC_URL,
      rpcBase:       !!(process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL),
      rpcSolana:     !!process.env.SOLANA_RPC_URL,
      // Streamflow + Jupiter Lock discoverers gate behind this exact value.
      // Anything other than the literal string "true" returns [] immediately
      // (43ms = cold start, no RPC call). Surface the actual value so a
      // misconfiguration is visible at a glance instead of a silent zero.
      solanaEnabled: process.env.SOLANA_ENABLED === "true",
    },
  };

  return NextResponse.json(result);
}

// Reference to keep CHAIN_IDS used (lint silencer; const is genuinely
// referenced in JSDoc above).
void CHAIN_IDS;
