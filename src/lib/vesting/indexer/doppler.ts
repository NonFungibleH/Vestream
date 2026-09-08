// src/lib/vesting/indexer/doppler.ts
// ─────────────────────────────────────────────────────────────────────────────
// Doppler (Airlock) discovery indexer.
//
// Per window: read Airlock's Create logs → for each new asset read
// getAssetData (integrator), vestingStart, vestedTotalAmount and
// vestingScheduleCount → skip anything with vesting disabled → read the
// schedules and the VestingAllocated logs (emitted in the create tx, so they
// are inside the same window) → upsert the registry → build streams for
// enabled integrators → writeToCache.
//
// Idempotent: every write is an upsert keyed on (chain, asset[, beneficiary,
// schedule]) and the streams are rebuilt from registry + live state, so
// re-scanning a window converges on the same rows.
//
// Volume note (Base, 2026-09-08): ~180 creates/day, ~20% with vesting on. A
// 5,000-block window (~2.8h) holds ~20 creates, ~4 of which get the extra
// per-asset log read. Cheap.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicClient } from "viem";
import { CHAIN_IDS, type SupportedChainId } from "../types";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { writeToCache } from "../dbcache";
import type { Indexer } from "./types";
import {
  DOPPLER_AIRLOCK,
  DOPPLER_GENESIS_BLOCK,
  DOPPLER_ENABLED_INTEGRATORS,
  AIRLOCK_ABI,
  DERC20_ABI,
  allocationsToVestingStreams,
  readLiveState,
  type DopplerAllocationRow,
} from "../adapters/doppler";

interface AssetInfo {
  asset:         string;      // lowercase
  integrator:    string;      // lowercase
  numeraire:     string;
  pool:          string;
  vestingStart:  bigint;
  vestedTotal:   bigint;
  scheduleCount: number;
  symbol:        string;
  decimals:      number;
  block:         bigint;
}

/** Read per-asset launch + vesting header fields via one multicall page. */
async function readAssetInfo(
  client:   PublicClient,
  airlock:  `0x${string}`,
  created:  { asset: `0x${string}`; numeraire: `0x${string}`; pool: `0x${string}`; block: bigint }[],
): Promise<AssetInfo[]> {
  const out: AssetInfo[] = [];
  const PAGE = 25; // 6 calls per asset
  for (let s = 0; s < created.length; s += PAGE) {
    const page = created.slice(s, s + PAGE);
    const contracts = page.flatMap((c) => [
      { address: airlock, abi: AIRLOCK_ABI, functionName: "getAssetData" as const, args: [c.asset] as const },
      { address: c.asset, abi: DERC20_ABI, functionName: "vestingStart" as const },
      { address: c.asset, abi: DERC20_ABI, functionName: "vestedTotalAmount" as const },
      { address: c.asset, abi: DERC20_ABI, functionName: "vestingScheduleCount" as const },
      { address: c.asset, abi: DERC20_ABI, functionName: "symbol" as const },
      { address: c.asset, abi: DERC20_ABI, functionName: "decimals" as const },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await client.multicall({ contracts: contracts as any, allowFailure: true });
    page.forEach((c, i) => {
      const [g, vs, vt, sc, sy, de] = res.slice(i * 6, i * 6 + 6);
      if (g.status !== "success") return;
      const data = g.result as readonly unknown[];
      const integrator = String(data[9]).toLowerCase();
      const vestedTotal = vt.status === "success" ? (vt.result as bigint) : 0n;
      out.push({
        asset:         c.asset.toLowerCase(),
        integrator,
        numeraire:     c.numeraire.toLowerCase(),
        pool:          c.pool.toLowerCase(),
        vestingStart:  vs.status === "success" ? (vs.result as bigint) : 0n,
        vestedTotal,
        scheduleCount: sc.status === "success" ? Number(sc.result as bigint) : 0,
        symbol:        sy.status === "success" ? String(sy.result) : "???",
        decimals:      de.status === "success" ? Number(de.result) : 18,
        block:         c.block,
      });
    });
  }
  return out;
}

async function upsertAssets(chainId: SupportedChainId, infos: AssetInfo[]): Promise<void> {
  for (const a of infos) {
    try {
      await db.execute(sql`
        INSERT INTO doppler_assets
          (chain_id, asset, integrator, numeraire, pool, token_symbol, token_decimals,
           vesting_start, vested_total, schedule_count, discovered_block)
        VALUES (${chainId}, ${a.asset}, ${a.integrator}, ${a.numeraire}, ${a.pool}, ${a.symbol}, ${a.decimals},
                ${a.vestingStart.toString()}, ${a.vestedTotal.toString()}, ${a.scheduleCount}, ${a.block.toString()})
        ON CONFLICT (chain_id, asset) DO UPDATE
          SET integrator     = EXCLUDED.integrator,
              token_symbol   = EXCLUDED.token_symbol,
              token_decimals = EXCLUDED.token_decimals,
              vesting_start  = EXCLUDED.vesting_start,
              vested_total   = EXCLUDED.vested_total,
              schedule_count = EXCLUDED.schedule_count
      `);
    } catch (err) {
      console.error(`[doppler-indexer/${chainId}] asset upsert ${a.asset}:`, err);
    }
  }
}

async function upsertAllocations(rows: DopplerAllocationRow[]): Promise<void> {
  for (const r of rows) {
    try {
      await db.execute(sql`
        INSERT INTO doppler_vesting_allocations
          (chain_id, asset, beneficiary, schedule_id, cliff_seconds, duration_seconds, allocated, discovered_block)
        VALUES (${r.chainId}, ${r.asset}, ${r.beneficiary}, ${r.scheduleId},
                ${r.cliffSeconds.toString()}, ${r.durationSeconds.toString()},
                ${r.allocated.toString()}, ${r.discoveredBlock.toString()})
        ON CONFLICT (chain_id, asset, beneficiary, schedule_id) DO UPDATE
          SET cliff_seconds    = EXCLUDED.cliff_seconds,
              duration_seconds = EXCLUDED.duration_seconds,
              allocated        = EXCLUDED.allocated
      `);
    } catch (err) {
      console.error(`[doppler-indexer/${r.chainId}] allocation upsert ${r.asset}/${r.beneficiary}:`, err);
    }
  }
}

/**
 * Per-chain scan window.
 *  - Base / Ethereum / Arbitrum: 2,000 matches the Hedgey and Magna Base
 *    indexers on the same pools. 5,000 was tried first and failed once the
 *    fallback rotated onto a provider with a tighter range cap.
 *  - Robinhood: ~570k blocks/day and ~4,000 Doppler launches/day (measured
 *    2026-09-08), so 2,000 blocks is five minutes of chain and an hourly cron
 *    could not keep up. The official RPC served a 2k Create window in 0.2s
 *    and full-range HoodLock scans, so 20,000 (~50 min of chain) is safe.
 * The runner's time-budgeted catch-up loop handles cold start; the local
 * scripts/_doppler-backfill.ts drives it to caught-up.
 */
const WINDOW: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ROBINHOOD]: 20_000n,
};

function makeIndexer(chainId: SupportedChainId): Indexer {
  const airlock = DOPPLER_AIRLOCK[chainId];
  const genesis = DOPPLER_GENESIS_BLOCK[chainId];
  if (!airlock || genesis == null) throw new Error(`Doppler indexer not configured for chainId ${chainId}`);

  return {
    protocol:     "doppler",
    chainId,
    genesisBlock: genesis,
    maxBlocksPerScan: WINDOW[chainId] ?? 2_000n,
    reorgLag: 30n,

    async scanWindow(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
      const createLogs = await client.getLogs({
        address: airlock,
        event:   AIRLOCK_ABI[0],
        fromBlock,
        toBlock,
      });
      if (createLogs.length === 0) return { eventCount: 0 };

      const created = createLogs
        .filter((l) => l.args.asset && l.args.numeraire && l.args.poolOrHook)
        .map((l) => ({
          asset:     l.args.asset!,
          numeraire: l.args.numeraire!,
          pool:      l.args.poolOrHook!,
          block:     l.blockNumber,
        }));

      const infos = await readAssetInfo(client, airlock, created);
      // Registry keeps every launch (cheap, and it is what makes the
      // integrator measurement repeatable), but only vesting-enabled assets
      // get schedules, allocations and streams.
      await upsertAssets(chainId, infos);
      // Older DERC20s (pre-schedule interface: vestingDuration() + a single
      // beneficiary, no vestingScheduleCount) land here with vestedTotal > 0
      // and scheduleCount 0. They are registry-only for now; none of the
      // enabled integrators use them (Bankr's February 2026 launches all have
      // vestedTotal == 0, verified on-chain 2026-09-08).
      const vesting = infos.filter((a) => a.vestedTotal > 0n && a.scheduleCount > 0);
      if (vesting.length === 0) return { eventCount: createLogs.length };

      // Schedules: vestingSchedules(i) for every (asset, i).
      const schedCalls = vesting.flatMap((a) =>
        Array.from({ length: a.scheduleCount }, (_, i) => ({
          address: a.asset as `0x${string}`, abi: DERC20_ABI,
          functionName: "vestingSchedules" as const, args: [BigInt(i)] as const,
        })));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schedRes = await client.multicall({ contracts: schedCalls as any, allowFailure: true });
      const schedules = new Map<string, { cliff: bigint; duration: bigint }>();
      let k = 0;
      for (const a of vesting) {
        for (let i = 0; i < a.scheduleCount; i++, k++) {
          const r = schedRes[k];
          if (r.status !== "success") continue;
          const [cliff, duration] = r.result as readonly [bigint, bigint];
          schedules.set(`${a.asset}:${i}`, { cliff, duration });
        }
      }

      // Allocations: VestingAllocated is emitted in the create tx, so the
      // window that contains the Create contains the allocations.
      const allocs: DopplerAllocationRow[] = [];
      for (const a of vesting) {
        let logs: Awaited<ReturnType<typeof client.getLogs<typeof DERC20_ABI[9]>>> = [];
        try {
          logs = await client.getLogs({
            address:   a.asset as `0x${string}`,
            event:     DERC20_ABI[9], // VestingAllocated
            fromBlock: a.block,
            toBlock,
          });
        } catch (err) {
          console.error(`[doppler-indexer/${chainId}] VestingAllocated ${a.asset}:`, err);
          continue;
        }
        for (const l of logs) {
          if (!l.args.beneficiary || l.args.scheduleId == null || l.args.amount == null) continue;
          const sid = Number(l.args.scheduleId);
          const sch = schedules.get(`${a.asset}:${sid}`) ?? { cliff: 0n, duration: 0n };
          allocs.push({
            chainId,
            asset:           a.asset,
            integrator:      a.integrator,
            beneficiary:     l.args.beneficiary.toLowerCase(),
            scheduleId:      sid,
            cliffSeconds:    sch.cliff,
            durationSeconds: sch.duration,
            allocated:       l.args.amount,
            vestingStart:    a.vestingStart,
            tokenSymbol:     a.symbol,
            tokenDecimals:   a.decimals,
            discoveredBlock: l.blockNumber,
          });
        }
      }
      await upsertAllocations(allocs);

      const enabled = allocs.filter((r) => r.integrator && DOPPLER_ENABLED_INTEGRATORS.has(r.integrator));
      if (enabled.length > 0) {
        const live    = await readLiveState(enabled, chainId);
        const streams = allocationsToVestingStreams(enabled, live);
        if (streams.length > 0) await writeToCache(streams);
      }
      return { eventCount: createLogs.length };
    },
  };
}

export const dopplerIndexers: Indexer[] = [
  makeIndexer(CHAIN_IDS.BASE),
  makeIndexer(CHAIN_IDS.ETHEREUM),
  makeIndexer(CHAIN_IDS.ARBITRUM),
  makeIndexer(CHAIN_IDS.ROBINHOOD),
];
