// src/lib/vesting/indexer/doppler-fees.ts
// ─────────────────────────────────────────────────────────────────────────────
// Doppler fee-stream registry indexer (StreamableFeesLockerV2).
//
// Per window, two sources:
//   Locker (address-filtered):
//     Lock(poolId, (beneficiary, shares)[], unlockDate)  → one row per beneficiary
//     Unlock(poolId, recipient)                          → flag is_unlocked
//     + streams(poolId) for currencies, recipient, lock window
//   Hook initializers (TOPIC-ONLY, any address — the emitter is the identity):
//     FeeBeneficiariesSet(poolId, (beneficiary, shares)[]) → rows with
//       locker = emitting contract, + getPoolKey(poolId) for currencies
//   Both: UpdateBeneficiary(poolId, old, new) topic-only → move the row. The claimable numbers are NOT stored here;
// they are read live per wallet (doppler-fees.ts) because they change on
// every swap.
//
// Idempotent: upserts keyed on (chain, pool, beneficiary); UpdateBeneficiary
// applied twice is a no-op once the old row is gone.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicClient } from "viem";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { Indexer } from "./types";
import { DOPPLER_FEE_LOCKER, DOPPLER_FEE_LOCKER_GENESIS, FEE_LOCKER_ABI } from "../doppler-fees";

const LOCK_EVENT   = FEE_LOCKER_ABI[0];
const SET_EVENT    = FEE_LOCKER_ABI[1]; // FeeBeneficiariesSet
const UNLOCK_EVENT = FEE_LOCKER_ABI[2];
const UPDATE_EVENT = FEE_LOCKER_ABI[3];

/** Same per-chain windows as the Airlock indexer, for the same RPC reasons. */
const WINDOW: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ROBINHOOD]: 20_000n,
  [CHAIN_IDS.ETHEREUM]:  1_000n,
};

interface StreamInfo {
  currency0: string; currency1: string; recipient: string;
  startDate: number; lockDuration: number; isUnlocked: boolean;
}

async function readStreams(
  client:  PublicClient,
  locker:  `0x${string}`,
  poolIds: `0x${string}`[],
): Promise<Map<string, StreamInfo>> {
  const out = new Map<string, StreamInfo>();
  const PAGE = 40;
  for (let s = 0; s < poolIds.length; s += PAGE) {
    const page = poolIds.slice(s, s + PAGE);
    const contracts = page.map((p) => ({ address: locker, abi: FEE_LOCKER_ABI, functionName: "streams" as const, args: [p] as const }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await client.multicall({ contracts: contracts as any, allowFailure: true });
    page.forEach((p, i) => {
      const r = res[i];
      if (r.status !== "success") return;
      const [key, recipient, startDate, lockDuration, isUnlocked] = r.result as readonly [
        { currency0: string; currency1: string }, string, number, number, boolean,
      ];
      out.set(p, {
        currency0: key.currency0.toLowerCase(), currency1: key.currency1.toLowerCase(),
        recipient: recipient.toLowerCase(), startDate: Number(startDate),
        lockDuration: Number(lockDuration), isUnlocked,
      });
    });
  }
  return out;
}

/** getPoolKey(poolId) on each hook initializer, for the currencies. */
async function readPoolKeys(
  client: PublicClient,
  pairs:  { manager: `0x${string}`; poolId: `0x${string}` }[],
): Promise<Map<string, { currency0: string; currency1: string }>> {
  const out = new Map<string, { currency0: string; currency1: string }>();
  const PAGE = 40;
  for (let s = 0; s < pairs.length; s += PAGE) {
    const page = pairs.slice(s, s + PAGE);
    const contracts = page.map((p) => ({ address: p.manager, abi: FEE_LOCKER_ABI, functionName: "getPoolKey" as const, args: [p.poolId] as const }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await client.multicall({ contracts: contracts as any, allowFailure: true });
    page.forEach((p, i) => {
      const r = res[i];
      if (r.status !== "success") return;
      const [c0, c1] = r.result as readonly [string, string, number, number, string];
      out.set(`${p.manager}:${p.poolId}`, { currency0: c0.toLowerCase(), currency1: c1.toLowerCase() });
    });
  }
  return out;
}

function makeIndexer(chainId: SupportedChainId): Indexer {
  const locker  = DOPPLER_FEE_LOCKER[chainId];
  const genesis = DOPPLER_FEE_LOCKER_GENESIS[chainId];
  if (!locker || genesis == null) throw new Error(`Doppler fee indexer not configured for chainId ${chainId}`);

  return {
    protocol:     "doppler-fees",
    chainId,
    genesisBlock: genesis,
    maxBlocksPerScan: WINDOW[chainId] ?? 2_000n,
    reorgLag: 30n,

    async scanWindow(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
      const [locks, sets, updates, unlocks] = await Promise.all([
        client.getLogs({ address: locker, event: LOCK_EVENT,   fromBlock, toBlock }),
        // Topic-only: no address. Verified served by mainnet.base.org, the
        // Robinhood official RPC and arb1.arbitrum.io; dRPC rejects it and
        // the fallback transport moves on.
        client.getLogs({ event: SET_EVENT,    fromBlock, toBlock }),
        client.getLogs({ event: UPDATE_EVENT, fromBlock, toBlock }),
        client.getLogs({ address: locker, event: UNLOCK_EVENT, fromBlock, toBlock }),
      ]);
      const eventCount = locks.length + sets.length + updates.length + unlocks.length;
      if (eventCount === 0) return { eventCount: 0 };

      // Hook initializers → rows keyed on the emitting contract.
      const setPairs = sets
        .filter((l) => l.args.poolId)
        .map((l) => ({ manager: l.address.toLowerCase() as `0x${string}`, poolId: l.args.poolId!.toLowerCase() as `0x${string}` }));
      const keys = await readPoolKeys(client, [...new Map(setPairs.map((p) => [`${p.manager}:${p.poolId}`, p])).values()]);
      for (const l of sets) {
        const poolId = l.args.poolId?.toLowerCase();
        const manager = l.address.toLowerCase();
        if (!poolId) continue;
        const k = keys.get(`${manager}:${poolId}`);
        for (const b of l.args.beneficiaries ?? []) {
          try {
            await db.execute(sql`
              INSERT INTO doppler_fee_streams
                (chain_id, locker, pool_id, currency0, currency1, beneficiary, shares, discovered_block)
              VALUES (${chainId}, ${manager}, ${poolId}, ${k?.currency0 ?? null}, ${k?.currency1 ?? null},
                      ${b.beneficiary.toLowerCase()}, ${b.shares.toString()}, ${l.blockNumber.toString()})
              ON CONFLICT (chain_id, pool_id, beneficiary) DO UPDATE
                SET shares = EXCLUDED.shares,
                    locker = EXCLUDED.locker,
                    currency0 = COALESCE(EXCLUDED.currency0, doppler_fee_streams.currency0),
                    currency1 = COALESCE(EXCLUDED.currency1, doppler_fee_streams.currency1)
            `);
          } catch (err) {
            console.error(`[doppler-fees/${chainId}] beneficiaries-set upsert ${poolId}/${b.beneficiary}:`, err);
          }
        }
      }

      // Locks → rows. streams() gives the pool key etc.
      const poolIds = [...new Set(locks.map((l) => l.args.poolId).filter((p): p is `0x${string}` => !!p))];
      const info = await readStreams(client, locker, poolIds);
      for (const l of locks) {
        const poolId = l.args.poolId?.toLowerCase();
        const bens = l.args.beneficiaries ?? [];
        if (!poolId) continue;
        const st = info.get(l.args.poolId!);
        for (const b of bens) {
          try {
            await db.execute(sql`
              INSERT INTO doppler_fee_streams
                (chain_id, locker, pool_id, currency0, currency1, beneficiary, shares,
                 recipient, start_date, lock_duration, is_unlocked, discovered_block)
              VALUES (${chainId}, ${locker}, ${poolId}, ${st?.currency0 ?? null}, ${st?.currency1 ?? null},
                      ${b.beneficiary.toLowerCase()}, ${b.shares.toString()},
                      ${st?.recipient ?? null}, ${st?.startDate ?? null}, ${st?.lockDuration ?? null},
                      ${st?.isUnlocked ?? false}, ${l.blockNumber.toString()})
              ON CONFLICT (chain_id, pool_id, beneficiary) DO UPDATE
                SET shares = EXCLUDED.shares,
                    currency0 = COALESCE(EXCLUDED.currency0, doppler_fee_streams.currency0),
                    currency1 = COALESCE(EXCLUDED.currency1, doppler_fee_streams.currency1),
                    recipient = COALESCE(EXCLUDED.recipient, doppler_fee_streams.recipient),
                    start_date = COALESCE(EXCLUDED.start_date, doppler_fee_streams.start_date),
                    lock_duration = COALESCE(EXCLUDED.lock_duration, doppler_fee_streams.lock_duration)
            `);
          } catch (err) {
            console.error(`[doppler-fees/${chainId}] lock upsert ${poolId}/${b.beneficiary}:`, err);
          }
        }
      }

      // Beneficiary changes: the new address inherits the slot.
      for (const u of updates) {
        const poolId = u.args.poolId?.toLowerCase();
        const from = u.args.oldBeneficiary?.toLowerCase();
        const to   = u.args.newBeneficiary?.toLowerCase();
        const manager = u.address.toLowerCase();
        if (!poolId || !from || !to || from === to) continue;
        try {
          await db.execute(sql`
            UPDATE doppler_fee_streams SET beneficiary = ${to}
             WHERE chain_id = ${chainId} AND pool_id = ${poolId} AND beneficiary = ${from} AND locker = ${manager}
               AND NOT EXISTS (SELECT 1 FROM doppler_fee_streams
                                WHERE chain_id = ${chainId} AND pool_id = ${poolId} AND beneficiary = ${to})
          `);
        } catch (err) {
          console.error(`[doppler-fees/${chainId}] beneficiary update ${poolId}:`, err);
        }
      }

      for (const u of unlocks) {
        const poolId = u.args.poolId?.toLowerCase();
        if (!poolId) continue;
        try {
          await db.execute(sql`
            UPDATE doppler_fee_streams SET is_unlocked = true
             WHERE chain_id = ${chainId} AND pool_id = ${poolId}
          `);
        } catch (err) {
          console.error(`[doppler-fees/${chainId}] unlock ${poolId}:`, err);
        }
      }

      return { eventCount };
    },
  };
}

export const dopplerFeeIndexers: Indexer[] = [
  makeIndexer(CHAIN_IDS.BASE),
  makeIndexer(CHAIN_IDS.ETHEREUM),
  makeIndexer(CHAIN_IDS.ARBITRUM),
  makeIndexer(CHAIN_IDS.ROBINHOOD),
];
