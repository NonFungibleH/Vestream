// src/lib/vesting/ingestors/team-finance-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Team Finance claim event ingestor.
//
// Two-step ingestion (Team Finance's data lives across REST + Squid):
//
//   1. Fetch every vesting contract the user is a recipient on, via Team
//      Finance's REST API. Reuses fetchWalletVestings() from the main
//      adapter so we can't drift on the API response shape.
//   2. For each chain the user has vests on, query Team Finance's Squid
//      GraphQL endpoint for vestingClaims events filtered by (account,
//      vesting addresses, chainId). Reuses fetchClaimEvents() from the
//      main adapter for the same reason.
//
// Schema reference (from Team Finance's open Squid):
//   vestingClaim {
//     account     // recipient (lowercase)
//     vesting     // vesting contract address (lowercase)
//     amount      // bigint string in token base units
//     timestamp   // unix seconds (sometimes numeric, sometimes string)
//   }
//
// The Squid doesn't expose txHash in this schema, so we fall back to a
// synthetic hash derived from (streamId, timestamp). The unique-index
// dedup on claim_events still works because synthetic hashes embed the
// stream id + timestamp.
// ─────────────────────────────────────────────────────────────────────────────

import {
  fetchWalletVestings,
  fetchClaimEvents,
  type TFVesting,
} from "../adapters/team-finance";
import { upsertClaimEvents, syntheticTxHash, type ClaimEventInput } from "./shared";
import type { SupportedChainId } from "../types";

// Same set of chains the main TF adapter supports.
const SUPPORTED_CHAINS: SupportedChainId[] = [1, 56, 137, 8453, 11155111] as SupportedChainId[];

/**
 * Ingest Team Finance claim events for one user across all their tracked
 * wallets and the chains where TF is deployed.
 *
 * Idempotent — the unique-index dedup on (chainId, txHash, recipient,
 * tokenAddress) makes re-running a no-op for already-seen events.
 */
export async function ingestTeamFinanceClaimsForUser(
  userId:    string,
  wallets:   string[],
  chainIds:  SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;
  const lowercased = wallets.map((a) => a.toLowerCase());

  // Step 1 — get all vestings per wallet via REST. Each TFVesting row
  // gives us (vesting contract address, token address, decimals, symbol,
  // chainId). We need this metadata to attribute claims to the right
  // token + chain.
  const perWallet = await Promise.all(lowercased.map(fetchWalletVestings));

  // Build (chainId → wallet → vesting address[] map) so we can fan out
  // the Squid queries in chain batches without N+1 round trips.
  type VestingMeta = TFVesting & { walletAddr: string };
  const byChain = new Map<number, VestingMeta[]>();
  for (let i = 0; i < lowercased.length; i++) {
    for (const v of perWallet[i]) {
      const raw = v.chainId;
      const vChainId = typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.startsWith("0x")
          ? parseInt(raw, 16)
          : Number(raw);
      if (!Number.isFinite(vChainId)) continue;
      if (!chainIds.includes(vChainId as SupportedChainId)) continue;
      const list = byChain.get(vChainId) ?? [];
      list.push({ ...v, walletAddr: lowercased[i] });
      byChain.set(vChainId, list);
    }
  }
  if (byChain.size === 0) return 0;

  const inputs: ClaimEventInput[] = [];

  // Step 2 — per chain, fetch claim events for each (wallet, [vesting addresses]).
  // The Squid takes a single account + vesting list, so we loop wallets within
  // each chain. Limit 200 events per query, ordered by timestamp DESC, gives
  // us the most recent 200 claims per wallet. Realistically a wallet doesn't
  // claim 200 times — this is a generous upper bound.
  for (const [chainId, vestings] of byChain.entries()) {
    const accounts = [...new Set(vestings.map((v) => v.walletAddr))];

    for (const account of accounts) {
      const accountVestings = vestings.filter((v) => v.walletAddr === account);
      const vestingAddrs = accountVestings.map((v) => v.address.toLowerCase());
      if (vestingAddrs.length === 0) continue;

      let claimsByVest: Map<string, Array<{ timestamp: number; amount: string }>>;
      try {
        claimsByVest = await fetchClaimEvents(account, vestingAddrs, chainId);
      } catch (err) {
        console.error(`[team-finance-claims] fetch failed for ${account} chain ${chainId}:`, err);
        continue;
      }

      for (const meta of accountVestings) {
        const events = claimsByVest.get(meta.address.toLowerCase());
        if (!events || events.length === 0) continue;

        // streamId convention matches the main adapter:
        //   team-finance-{chainId}-{vestingAddress}-{walletAddress}
        // (line 304 of adapters/team-finance.ts)
        const streamId = `team-finance-${chainId}-${meta.address.toLowerCase()}-${account}`;
        const tokenAddress  = meta.token.toLowerCase();
        const tokenSymbol   = meta.tokenSymbol;
        const tokenDecimals = Number(meta.tokenDecimals);

        for (const ev of events) {
          if (!ev.amount || ev.amount === "0") continue;
          // The Squid's claim entity doesn't carry a txHash field, so we
          // synthesise one. Dedup index on (chainId, txHash, recipient,
          // tokenAddress) still collapses re-ingestions because the
          // synthetic hash is deterministic for the same (stream, ts).
          const txHash = syntheticTxHash(streamId, ev.timestamp);

          inputs.push({
            userId,
            streamId,
            protocol:      "team-finance",
            chainId,
            recipient:     account,
            tokenAddress,
            tokenSymbol:   tokenSymbol || null,
            tokenDecimals,
            amount:        ev.amount,
            claimedAt:     new Date(ev.timestamp * 1000),
            txHash,
          });
        }
      }
    }
  }

  return upsertClaimEvents(inputs);
}
