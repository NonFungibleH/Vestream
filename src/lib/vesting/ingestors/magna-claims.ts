// src/lib/vesting/ingestors/magna-claims.ts
// ─────────────────────────────────────────────────────────────────────────────
// Magna claim event ingestor — the income half of the tax tool for Magna.
//
// A Magna claim is an ERC-20 Transfer OUT of a vester escrow INTO the
// recipient's wallet. There is no bespoke Claim event to watch, so we identify
// claims by provenance: any incoming ERC-20 transfer whose sender is a known
// Magna vester (the magna_vesters registry the Phase 1 walker maintains).
//
// WHY AN EXPLORER RATHER THAN eth_getLogs: a per-wallet log scan would have to
// walk from the factory genesis (Ethereum ~16.9M) in 10k-block chunks — ~900
// requests per wallet per chain, far too heavy for the daily ingest cron. The
// explorer returns a wallet's whole transfer history in a couple of paginated
// calls. This mirrors team-finance-claims.ts, which also sources from an
// upstream API rather than logs.
//
// Chains without a usable explorer (Base, BSC) are skipped rather than
// half-covered — the function no-ops for them and reports honestly, same
// posture as the Solana ingestors when SOLANA_ENABLED is off.
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { magnaVesters } from "@/lib/db/schema";
import { upsertClaimEvents, type ClaimEventInput } from "./shared";
import { CHAIN_IDS, type SupportedChainId } from "../types";

/** Blockscout v2 instances we trust for this. Base/BSC deliberately absent. */
const EXPLORER: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "https://eth.blockscout.com",
  [CHAIN_IDS.OPTIMISM]: "https://optimism.blockscout.com",
  [CHAIN_IDS.POLYGON]:  "https://polygon.blockscout.com",
  [CHAIN_IDS.ARBITRUM]: "https://arbitrum.blockscout.com",
};

const SUPPORTED_CHAINS = Object.keys(EXPLORER).map(Number) as SupportedChainId[];
const MAX_PAGES = 20;                     // ~1k transfers per wallet, plenty
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TransferItem {
  from?:             { hash?: string };
  transaction_hash?: string;
  timestamp?:        string;
  token?:            { address_hash?: string; address?: string; symbol?: string; decimals?: string };
  total?:            { value?: string; decimals?: string };
}

/** Vester addresses (lowercased) for a chain, from the registry. */
async function vesterSet(chainId: number): Promise<Set<string>> {
  try {
    const rows = await db.select({ address: magnaVesters.address })
      .from(magnaVesters).where(sql`${magnaVesters.chainId} = ${chainId}`);
    return new Set(rows.map((r) => r.address.toLowerCase()));
  } catch (err) {
    console.error(`[magna-claims] registry read chain ${chainId}:`, err);
    return new Set();
  }
}

/**
 * Cached Magna stream ids for this user's wallets, keyed
 * `${chainId}:${recipient}:${tokenAddress}` → streamId, so each claim can be
 * attributed to the stream the tax report groups by.
 */
async function streamIdIndex(wallets: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (wallets.length === 0) return map;
  try {
    const rows = (await db.execute(sql`
      SELECT stream_id AS "streamId", chain_id AS "chainId",
             recipient, token_address AS "tokenAddress"
      FROM vesting_streams_cache
      WHERE protocol = 'magna' AND lower(recipient) = ANY(ARRAY[${sql.join(
        wallets.map((w) => sql`${w.toLowerCase()}`), sql`, `,
      )}]::text[])
    `)) as unknown as { streamId: string; chainId: number; recipient: string; tokenAddress: string }[];
    for (const r of rows) {
      map.set(`${r.chainId}:${r.recipient.toLowerCase()}:${r.tokenAddress.toLowerCase()}`, r.streamId);
    }
  } catch (err) {
    console.error("[magna-claims] stream index:", err);
  }
  return map;
}

export async function ingestMagnaClaimsForUser(
  userId:   string,
  wallets:  string[],
  chainIds: SupportedChainId[] = SUPPORTED_CHAINS,
): Promise<number> {
  if (wallets.length === 0) return 0;

  const chains = chainIds.filter((c) => EXPLORER[c]);
  if (chains.length === 0) return 0;

  const streamIds = await streamIdIndex(wallets);
  const inputs: ClaimEventInput[] = [];

  for (const chainId of chains) {
    const vesters = await vesterSet(chainId);
    if (vesters.size === 0) continue;                 // nothing indexed on this chain yet
    const base = EXPLORER[chainId]!;

    for (const wallet of wallets) {
      const recipient = wallet.toLowerCase();
      let params = "";
      for (let page = 0; page < MAX_PAGES; page++) {
        let body: { items?: TransferItem[]; next_page_params?: Record<string, unknown> };
        try {
          const res = await fetch(`${base}/api/v2/addresses/${recipient}/token-transfers?type=ERC-20${params ? "&" + params : ""}`);
          if (!res.ok) break;                          // explorer down — skip this wallet
          body = await res.json();
        } catch { break; }

        for (const it of body.items ?? []) {
          const from = it.from?.hash?.toLowerCase();
          if (!from || !vesters.has(from)) continue;   // not a Magna payout
          const token = (it.token?.address_hash ?? it.token?.address ?? "").toLowerCase();
          const amount = it.total?.value;
          if (!token || !amount || !it.transaction_hash || !it.timestamp) continue;

          const streamId = streamIds.get(`${chainId}:${recipient}:${token}`)
            // Fall back to a deterministic id if the stream isn't cached yet —
            // keeps the claim (and its USD value) rather than dropping it.
            ?? `magna-${chainId}-${from}-${recipient}`;

          inputs.push({
            userId,
            streamId,
            protocol:      "magna",
            chainId,
            recipient,
            tokenAddress:  token,
            tokenSymbol:   it.token?.symbol ?? null,
            tokenDecimals: Number(it.total?.decimals ?? it.token?.decimals ?? 18),
            amount,
            claimedAt:     new Date(it.timestamp),
            txHash:        it.transaction_hash,
          });
        }

        if (!body.next_page_params) break;
        params = new URLSearchParams(
          Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)]),
        ).toString();
        await sleep(200);                              // be polite to the explorer
      }
    }
  }

  if (inputs.length === 0) return 0;
  return upsertClaimEvents(inputs);
}
