// src/lib/vesting/ponzu-discovery.ts
// ─────────────────────────────────────────────────────────────────────────────
// Ponzu presale discovery: factory logs -> ponzu_presales registry.
//
// The claim event lives on each presale CLONE, so before we can watch claims we
// need to know which addresses to watch. That is what this does, and it is the
// same pattern as the Magna vester registry (tvl-walker/magna.ts): scan the
// factory in bounded windows, upsert what we find, and let the registry
// accumulate so discovered clones survive aging out of a free-tier getLogs
// window.
//
// NOT wired into a cron yet — Ponzu has no live projects on mainnet or
// Robinhood Chain (confirmed with their team 2026-09-02: deployed, but "no one
// has pulled the trigger"). This is groundwork so that when the first project
// launches we are ready the same day rather than starting from scratch.
// ─────────────────────────────────────────────────────────────────────────────
import { createPublicClient, http, decodeEventLog, type PublicClient } from "viem";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getRpcUrl } from "./rpc";
import type { SupportedChainId } from "./types";
import { PONZU_RECIPE, PONZU_CRAFTED_ABI, PONZU_CRAFTED_TOPIC } from "./ponzu";

/** Free-tier friendly. Robinhood's own RPC serves wider, but 9k is safe everywhere. */
const WINDOW = 9_000n;

export interface DiscoveredPresale {
  chainId:           SupportedChainId;
  presale:           string;
  token:             string;
  distributor:       string;
  tokenSymbol:       string;
  vestingDuration:   bigint;
  presaleAllocation: bigint;
  block:             bigint;
}

/** Decode one PonzuCrafted log into the fields we persist. */
export function decodeCrafted(
  chainId: SupportedChainId,
  log: { data: `0x${string}`; topics: readonly `0x${string}`[]; blockNumber: bigint | null },
): DiscoveredPresale | null {
  try {
    const d = decodeEventLog({
      abi: PONZU_CRAFTED_ABI,
      data: log.data,
      topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
    }) as unknown as {
      args: {
        tokenSymbol: string;
        addresses: { token: string; presale: string; distributor: string };
        terms: { vestingDuration: bigint; presaleAllocation: bigint };
      };
    };
    return {
      chainId,
      presale:           d.args.addresses.presale.toLowerCase(),
      token:             d.args.addresses.token.toLowerCase(),
      distributor:       d.args.addresses.distributor.toLowerCase(),
      tokenSymbol:       d.args.tokenSymbol,
      vestingDuration:   d.args.terms.vestingDuration,
      presaleAllocation: d.args.terms.presaleAllocation,
      block:             log.blockNumber ?? 0n,
    };
  } catch {
    // Not a PonzuCrafted we understand — skip rather than abort the scan.
    return null;
  }
}

/** Scan a block range of the factory and upsert every project found. */
export async function discoverPonzuPresales(
  chainId: SupportedChainId,
  fromBlock: bigint,
  toBlock: bigint,
  client?: PublicClient,
): Promise<DiscoveredPresale[]> {
  const recipe = PONZU_RECIPE[chainId];
  if (!recipe) return [];

  const c = client ?? createPublicClient({
    transport: http(String(await getRpcUrl(chainId, { forLogs: true }))),
  });

  const found: DiscoveredPresale[] = [];
  for (let from = fromBlock; from <= toBlock; from += WINDOW) {
    const to = from + WINDOW > toBlock ? toBlock : from + WINDOW;
    let logs;
    try {
      logs = await c.getLogs({ address: recipe, fromBlock: from, toBlock: to });
    } catch (err) {
      // One bad window must not kill the whole scan — the next tick retries it.
      console.error(`[ponzu:${chainId}] getLogs ${from}-${to} failed:`, String(err).slice(0, 120));
      continue;
    }
    for (const l of logs) {
      if (l.topics[0] !== PONZU_CRAFTED_TOPIC) continue;
      const d = decodeCrafted(chainId, l);
      if (d) found.push(d);
    }
  }

  for (const p of found) {
    try {
      await db.execute(sql`
        INSERT INTO ponzu_presales
          (chain_id, presale, token, distributor, token_symbol, vesting_duration, presale_allocation, discovered_block)
        VALUES (${p.chainId}, ${p.presale}, ${p.token}, ${p.distributor}, ${p.tokenSymbol},
                ${p.vestingDuration.toString()}, ${p.presaleAllocation.toString()}, ${p.block.toString()})
        ON CONFLICT (chain_id, presale) DO UPDATE
          SET token = EXCLUDED.token,
              distributor = EXCLUDED.distributor,
              token_symbol = EXCLUDED.token_symbol,
              vesting_duration = EXCLUDED.vesting_duration,
              presale_allocation = EXCLUDED.presale_allocation
      `);
    } catch (err) {
      console.error(`[ponzu:${chainId}] registry upsert ${p.presale} failed:`, err);
    }
  }
  return found;
}

/** Presales we know about on a chain — the address set the claim scan watches. */
export async function readPonzuPresales(chainId: SupportedChainId): Promise<string[]> {
  try {
    const r = await db.execute(sql`
      SELECT presale FROM ponzu_presales WHERE chain_id = ${chainId}
    `);
    const rows = (r as unknown as { rows?: { presale: string }[] }).rows
              ?? (r as unknown as { presale: string }[]);
    return rows.map((x) => x.presale);
  } catch (err) {
    console.error(`[ponzu:${chainId}] registry read failed:`, err);
    return [];
  }
}
