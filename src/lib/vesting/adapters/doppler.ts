import { parseAbi } from "viem";
import { VestingAdapter } from "./index";
import {
  VestingStream,
  SupportedChainId,
  CHAIN_IDS,
  computeLinearVesting,
  nextUnlockTime,
} from "../types";
import { makeFallbackClient } from "../rpc";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// ─── Doppler (Airlock + DERC20) — token launches with built-in vesting ────────
// Doppler is the launch infrastructure under Bankr, Zora, Paragraph, Noice and
// Pure Markets. One orchestrator (Airlock) mints a DERC20 per launch and the
// vesting lives INSIDE that token contract: the vested allocation is minted to
// the token's own address and released to beneficiaries by schedule.
//
// Verified on Base against a live Bankr launch (tx 0x0b80922e…dc59):
//   - 15% of supply minted to the token itself, 85% to Airlock for the pool
//   - vestingStart(), vestedTotalAmount(), computeAvailableVestedAmount()
//   - Airlock.getAssetData(asset).integrator identifies the LAUNCHPAD
//     (Bankr = 0xf60633d0…163e). The Create event's `initializer` does NOT —
//     it is a shared Doppler module.
//
// Because there is no beneficiary -> tokens index on chain, positions are
// discovered by the event indexer (indexer/doppler.ts) into the
// doppler_assets / doppler_vesting_allocations registry (drizzle/0043), and a
// wallet scan is a registry lookup followed by live multicall reads here.
//
// Schedule model (DopplerERC20V1, verified ABI): vestingSchedules(i) returns
// (cliff, duration) as SECONDS FROM vestingStart. Nothing is releasable before
// start + cliff; after that the back-accrued amount unlocks and release
// continues linearly to start + duration. That is exactly
// computeLinearVesting(total, released, start, start+duration, now, start+cliff),
// and we still take claimableNow from the contract's own
// computeAvailableVestedAmount so the number a user sees is the number the
// contract will honour.
//
// SCOPE GUARD (2026-09): only assets launched by DOPPLER_ENABLED_INTEGRATORS
// become streams. Everything vesting-enabled is still recorded in the
// registry, so widening is a one-line change, not a re-index. Measured on
// Base 2026-09-08: 400 launches in ~25h, 18 Bankr (14 with vesting on); the
// two largest integrators (68% of volume) never vest.
// ─────────────────────────────────────────────────────────────────────────────

/** Airlock per chain. Source: whetstoneresearch/doppler-sdk deployments. Lowercase. */
export const DOPPLER_AIRLOCK: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]:  "0xde3599a2ec440b296373a983c85c365da55d9dfa",
  [CHAIN_IDS.BASE]:      "0x660eaaedebc968f8f3694354fa8ec0b4c5ba8d12",
  [CHAIN_IDS.ARBITRUM]:  "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
  [CHAIN_IDS.ROBINHOOD]: "0xeb7c034704ef8dcd2d32324c1545f62fb4ad0862",
};

/**
 * Indexer cold-start blocks.
 *
 * Base: Airlock was deployed at 28,415,516 but Bankr only moved from Clanker
 * to Doppler on 10 Feb 2026 (block ~41.98M), and Bankr is the only enabled
 * integrator. Starting ~2 days earlier skips 13.5M blocks (2,700 windows) of
 * chain that cannot contain a Bankr launch. Widen backwards if another
 * integrator is enabled.
 * Ethereum: Airlock deployment block (eth_getCode bisection, 2026-09-08).
 * Arbitrum: Airlock deployment block (eth_getCode bisection on blastapi).
 * Robinhood: block of the Airlock deployment tx listed in Doppler's
 * Deployments.md (0x8ffd957b…291a); the official RPC serves no historical
 * state so bisection is impossible there.
 */
export const DOPPLER_GENESIS_BLOCK: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]:  24_326_115n,
  [CHAIN_IDS.BASE]:      41_900_000n,
  [CHAIN_IDS.ARBITRUM]:  494_617_839n,
  [CHAIN_IDS.ROBINHOOD]: 646_829n,
};

/** Launchpads whose vesting we surface as streams. Lowercase. */
export const DOPPLER_ENABLED_INTEGRATORS = new Set<string>([
  "0xf60633d02690e2a15a54ab919925f3d038df163e", // Bankr
]);

/** Human label per integrator, for logs and future display. */
export const DOPPLER_INTEGRATOR_NAMES: Record<string, string> = {
  "0xf60633d02690e2a15a54ab919925f3d038df163e": "Bankr",
};

export const AIRLOCK_ABI = parseAbi([
  "event Create(address asset, address indexed numeraire, address initializer, address poolOrHook)",
  "function getAssetData(address asset) view returns (address numeraire, address timelock, address governance, address liquidityMigrator, address poolInitializer, address pool, address migrationPool, uint256 numTokensToSell, uint256 totalSupply, address integrator)",
]);

/** keccak256("Create(address,address,address,address)") — matches the live log. */
export const AIRLOCK_CREATE_TOPIC =
  "0x68ff1cfcdcf76864161555fc0de1878d8f83ec6949bf351df74d8a4a1a2679ab" as const;

export const DERC20_ABI = parseAbi([
  "function vestingStart() view returns (uint256)",
  "function vestedTotalAmount() view returns (uint256)",
  "function vestingScheduleCount() view returns (uint256)",
  "function vestingSchedules(uint256 scheduleId) view returns (uint64 cliff, uint64 duration)",
  "function vestingOf(address beneficiary, uint256 scheduleId) view returns (uint256 totalAmount, uint256 releasedAmount)",
  "function computeAvailableVestedAmount(address beneficiary, uint256 scheduleId) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "event VestingScheduleCreated(uint256 indexed scheduleId, uint64 cliff, uint64 duration)",
  "event VestingAllocated(address indexed beneficiary, uint256 indexed scheduleId, uint256 amount)",
  "event TokensReleased(address indexed beneficiary, uint256 indexed scheduleId, uint256 amount)",
]);

// ─── Registry rows ────────────────────────────────────────────────────────────

/** One (asset, beneficiary, schedule) allocation joined with its asset row. */
export interface DopplerAllocationRow {
  chainId:         SupportedChainId;
  asset:           string;   // lowercase
  integrator:      string | null;
  beneficiary:     string;   // lowercase
  scheduleId:      number;
  cliffSeconds:    bigint;
  durationSeconds: bigint;
  allocated:       bigint;
  vestingStart:    bigint | null;
  tokenSymbol:     string | null;
  tokenDecimals:   number;
  discoveredBlock: bigint;
}

type RawRow = {
  chain_id: number; asset: string; integrator: string | null; beneficiary: string;
  schedule_id: number; cliff_seconds: string | number; duration_seconds: string | number;
  allocated: string | number; vesting_start: string | number | null;
  token_symbol: string | null; token_decimals: number; discovered_block: string | number;
};

function rowsOf(r: unknown): RawRow[] {
  return (r as { rows?: RawRow[] }).rows ?? (r as RawRow[]);
}

function toAllocation(x: RawRow): DopplerAllocationRow {
  return {
    chainId:         x.chain_id as SupportedChainId,
    asset:           x.asset.toLowerCase(),
    integrator:      x.integrator ? x.integrator.toLowerCase() : null,
    beneficiary:     x.beneficiary.toLowerCase(),
    scheduleId:      Number(x.schedule_id),
    cliffSeconds:    BigInt(x.cliff_seconds ?? 0),
    durationSeconds: BigInt(x.duration_seconds ?? 0),
    allocated:       BigInt(String(x.allocated ?? "0").split(".")[0]),
    vestingStart:    x.vesting_start == null ? null : BigInt(x.vesting_start),
    tokenSymbol:     x.token_symbol,
    tokenDecimals:   Number(x.token_decimals ?? 18),
    discoveredBlock: BigInt(x.discovered_block ?? 0),
  };
}

/**
 * Allocations for a set of beneficiaries on one chain, restricted to enabled
 * integrators. Empty on any DB error (adapters must never throw).
 */
export async function readAllocationsForWallets(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<DopplerAllocationRow[]> {
  const lower = [...new Set(wallets.map((w) => w.toLowerCase()))];
  if (lower.length === 0) return [];
  const integrators = [...DOPPLER_ENABLED_INTEGRATORS];
  try {
    const r = await db.execute(sql`
      SELECT a.chain_id, a.asset, s.integrator, a.beneficiary, a.schedule_id,
             a.cliff_seconds, a.duration_seconds, a.allocated,
             s.vesting_start, s.token_symbol, s.token_decimals, a.discovered_block
        FROM doppler_vesting_allocations a
        JOIN doppler_assets s ON s.chain_id = a.chain_id AND s.asset = a.asset
       WHERE a.chain_id = ${chainId}
         AND a.beneficiary IN ${lower}
         AND s.integrator IN ${integrators}
    `);
    return rowsOf(r).map(toAllocation);
  } catch (err) {
    console.error(`[doppler/${chainId}] registry read failed:`, err);
    return [];
  }
}

// ─── Live state ───────────────────────────────────────────────────────────────

export interface DopplerLiveState {
  releasedAmount: bigint;
  claimableNow:   bigint;
}

/**
 * Batch-read vestingOf + computeAvailableVestedAmount for each allocation.
 * Missing entries mean the read failed; callers fall back to registry-only
 * numbers rather than dropping the position.
 */
export async function readLiveState(
  allocs:  DopplerAllocationRow[],
  chainId: SupportedChainId,
): Promise<Map<string, DopplerLiveState>> {
  const out = new Map<string, DopplerLiveState>();
  if (allocs.length === 0) return out;
  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) return out;

  const PAGE = 40; // 2 calls per allocation; keep responses under free-RPC caps
  for (let start = 0; start < allocs.length; start += PAGE) {
    const page = allocs.slice(start, start + PAGE);
    const contracts = page.flatMap((a) => [
      { address: a.asset as `0x${string}`, abi: DERC20_ABI, functionName: "vestingOf" as const,
        args: [a.beneficiary as `0x${string}`, BigInt(a.scheduleId)] as const },
      { address: a.asset as `0x${string}`, abi: DERC20_ABI, functionName: "computeAvailableVestedAmount" as const,
        args: [a.beneficiary as `0x${string}`, BigInt(a.scheduleId)] as const },
    ]);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await client.multicall({ contracts: contracts as any, allowFailure: true });
      page.forEach((a, i) => {
        const v = res[i * 2], c = res[i * 2 + 1];
        if (v.status !== "success" || c.status !== "success") return;
        const [, released] = v.result as readonly [bigint, bigint];
        out.set(allocationKey(a), { releasedAmount: released, claimableNow: c.result as bigint });
      });
    } catch (err) {
      console.error(`[doppler/${chainId}] live-state multicall:`, err);
    }
  }
  return out;
}

export function allocationKey(a: DopplerAllocationRow): string {
  return `${a.asset}:${a.beneficiary}:${a.scheduleId}`;
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

export function streamId(a: DopplerAllocationRow): string {
  return `doppler-${a.chainId}-${a.asset}-${a.scheduleId}-${a.beneficiary}`;
}

/**
 * Registry rows + live state → VestingStream rows. Shared by the adapter, the
 * indexer and the seeder so all three produce byte-identical rows (the
 * writeToCache setWhere dedup depends on that).
 */
export function allocationsToVestingStreams(
  allocs: DopplerAllocationRow[],
  live:   Map<string, DopplerLiveState>,
): VestingStream[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const out: VestingStream[] = [];

  for (const a of allocs) {
    if (a.vestingStart == null || a.allocated === 0n) continue;
    const start = Number(a.vestingStart);
    const cliff = start + Number(a.cliffSeconds);
    const end   = start + Number(a.durationSeconds);
    const state = live.get(allocationKey(a));
    const released = state?.releasedAmount ?? 0n;

    // A zero-duration schedule (seen on Robinhood from other integrators) is
    // "everything releasable at start". computeLinearVesting divides by the
    // duration and would report nothing vested, so handle it directly.
    const computed = a.durationSeconds === 0n
      ? (nowSec >= start
          ? { claimableNow: a.allocated > released ? a.allocated - released : 0n, lockedAmount: 0n, isFullyVested: true }
          : { claimableNow: 0n, lockedAmount: a.allocated, isFullyVested: false })
      : computeLinearVesting(a.allocated, released, start, end, nowSec, cliff);
    // The contract is authoritative for what is claimable right now.
    const claimableNow = state?.claimableNow ?? computed.claimableNow;
    const isFullyVested = computed.isFullyVested && released >= a.allocated;

    out.push({
      id:              streamId(a),
      protocol:        "doppler",
      category:        "vesting",
      chainId:         a.chainId,
      recipient:       a.beneficiary,
      tokenAddress:    a.asset,
      tokenSymbol:     a.tokenSymbol ?? "???",
      tokenDecimals:   a.tokenDecimals,
      totalAmount:     a.allocated.toString(),
      withdrawnAmount: released.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    computed.lockedAmount.toString(),
      startTime:       start,
      endTime:         end,
      cliffTime:       a.cliffSeconds > 0n ? cliff : null,
      isFullyVested,
      // Linear after the cliff: the only discrete moment is the cliff itself.
      nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, a.cliffSeconds > 0n ? cliff : null, end),
      cancelable:      false,
      shape:           "linear",
      // release(scheduleId, amount) on the token, by the beneficiary. Bankr
      // users normally claim through the Bankr Terminal instead.
      claimContract:   a.asset,
      claimNativeId:   String(a.scheduleId),
    });
  }
  return out;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  if (!DOPPLER_AIRLOCK[chainId]) return [];
  const allocs = await readAllocationsForWallets(wallets, chainId);
  if (allocs.length === 0) return [];
  const live = await readLiveState(allocs, chainId);
  return allocationsToVestingStreams(allocs, live);
}

export const dopplerAdapter: VestingAdapter = {
  id:   "doppler",
  // Personal-view display name: the launchpad the creator used, matching the
  // protocol-constants entry. Rename if a second integrator is enabled.
  name: "Bankr",
  supportedChainIds: Object.keys(DOPPLER_AIRLOCK).map(Number) as SupportedChainId[],
  fetch: fetchForChain,
};
