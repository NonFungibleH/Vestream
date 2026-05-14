// src/lib/vesting/indexer/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Indexer registry — single source of truth for "what (protocol, chainId)
// pairs are event-indexed?".
//
// To add a new indexer:
//   1. Implement Indexer in ./<protocol>.ts (see ./uncx-vm.ts for the
//      reference implementation)
//   2. Append to INDEXERS below
//   3. Add a vercel.json cron entry pointing at
//      /api/cron/indexer?protocol=X&chainId=Y
//
// The cron route is generic — it looks up the indexer here and hands it to
// the runner. No route changes needed when adding a new protocol.
// ─────────────────────────────────────────────────────────────────────────────

import type { Indexer } from "./types";
import { uncxVmIndexers } from "./uncx-vm";

export const INDEXERS: Indexer[] = [
  ...uncxVmIndexers,
];

/**
 * Look up an Indexer by (protocol, chainId). Returns undefined when no
 * indexer is registered — caller decides whether that's a 404 or a 400.
 */
export function findIndexer(protocol: string, chainId: number): Indexer | undefined {
  return INDEXERS.find((i) => i.protocol === protocol && i.chainId === chainId);
}

export type { Indexer } from "./types";
export { runIndexer, type RunResult } from "./runner";
