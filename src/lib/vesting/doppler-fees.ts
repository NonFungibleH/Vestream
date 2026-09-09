import { parseAbi } from "viem";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { CHAIN_IDS, type SupportedChainId } from "./types";
import { makeFallbackClient } from "./rpc";
import { fetchTokenMeta } from "./adapters/hoodlock";
import { getQuickUsdPrices, toUsdValue } from "./quick-prices";

// ─── Doppler fee streams: "Fees owed" ────────────────────────────────────────
// Every Doppler launch locks its pool's liquidity in StreamableFeesLockerV2
// and streams the pool's trading fees to a set of beneficiaries, weighted by
// shares that sum to WAD (1e18), forever. Verified from the locker's source
// (Base, 0xcE3212e6…3D47, 2026-09-08):
//
//              (cumulatedFees - lastCumulatedFees[beneficiary]) * shares
//     fees  =  ─────────────────────────────────────────────────────────
//                                      WAD
//
// per token side. `cumulatedFees` only grows when someone calls
// collectFees(poolId) (anyone can), so the number we show is fees already
// pulled out of the Uniswap position and waiting for the beneficiary, not
// fees still accruing inside the position. That is the honest "claimable
// now"; the in-position part is upside we do not estimate.
//
// This is NOT vesting. Nothing here touches vesting_streams_cache, the
// calendar, TVL or a public page. It is read per wallet at scan time and
// rendered as "Fees owed", last, inside the personal view only. See the
// feedback_one_promise_not_four_products memory for why.
// ─────────────────────────────────────────────────────────────────────────────

export const WAD = 10n ** 18n;

/** StreamableFeesLockerV2 per chain. Source: doppler-sdk deployments. Lowercase. */
export const DOPPLER_FEE_LOCKER: Partial<Record<SupportedChainId, `0x${string}`>> = {
  [CHAIN_IDS.ETHEREUM]:  "0xce3212e6536f33cd6fbfee265224131353ca3d47",
  [CHAIN_IDS.BASE]:      "0xce3212e6536f33cd6fbfee265224131353ca3d47",
  [CHAIN_IDS.ARBITRUM]:  "0xed822828b6109d16a9d362b8146a35789e0064f5",
  [CHAIN_IDS.ROBINHOOD]: "0x7b6147ac3f615bdb764e7ebd5f517dac1ad163b8",
};

/**
 * Locker deployment blocks. Base/Ethereum/Arbitrum by eth_getCode
 * bisection; Robinhood from the deployment tx in Doppler's Deployments.md
 * (0x8ff7d1d8…01c5). All 2026-09-08/09.
 */
export const DOPPLER_FEE_LOCKER_GENESIS: Partial<Record<SupportedChainId, bigint>> = {
  [CHAIN_IDS.ETHEREUM]:  24_521_131n,
  [CHAIN_IDS.BASE]:      42_539_492n,
  [CHAIN_IDS.ARBITRUM]:  494_617_853n,
  [CHAIN_IDS.ROBINHOOD]: 646_834n,
};

export const FEE_LOCKER_ABI = parseAbi([
  "event Lock(bytes32 indexed poolId, (address beneficiary, uint96 shares)[] beneficiaries, uint256 unlockDate)",
  "event Unlock(bytes32 indexed poolId, address recipient)",
  "event UpdateBeneficiary(bytes32 poolId, address oldBeneficiary, address newBeneficiary)",
  "event Release(bytes32 indexed poolId, address indexed beneficiary, uint256 fees0, uint256 fees1)",
  "function streams(bytes32 poolId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, address recipient, uint32 startDate, uint32 lockDuration, bool isUnlocked)",
  "function getCumulatedFees0(bytes32 poolId) view returns (uint256)",
  "function getCumulatedFees1(bytes32 poolId) view returns (uint256)",
  "function getLastCumulatedFees0(bytes32 poolId, address beneficiary) view returns (uint256)",
  "function getLastCumulatedFees1(bytes32 poolId, address beneficiary) view returns (uint256)",
  "function getShares(bytes32 poolId, address beneficiary) view returns (uint256)",
]);

/** Uniswap v4 uses address(0) for the chain's native currency. */
export const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000";

/** Wrapped-native per chain, used only to PRICE native-currency fee sides. */
const WRAPPED_NATIVE: Partial<Record<SupportedChainId, string>> = {
  [CHAIN_IDS.ETHEREUM]: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  [CHAIN_IDS.BASE]:     "0x4200000000000000000000000000000000000006",
  [CHAIN_IDS.ARBITRUM]: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
};

/**
 * A beneficiary's claimable slice of one token side. Pure.
 * (cumulated - last) * shares / WAD, floored at zero if the registry is
 * ahead of the chain for any reason.
 */
export function feeShare(cumulated: bigint, last: bigint, shares: bigint): bigint {
  if (cumulated <= last || shares <= 0n) return 0n;
  return ((cumulated - last) * shares) / WAD;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface FeeStreamRow {
  chainId:      SupportedChainId;
  locker:       string;
  poolId:       `0x${string}`;
  currency0:    string | null;
  currency1:    string | null;
  beneficiary:  string;
  shares:       bigint;
  recipient:    string | null;
  startDate:    number | null;
  lockDuration: number | null;
  isUnlocked:   boolean;
}

type RawRow = {
  chain_id: number; locker: string; pool_id: string; currency0: string | null; currency1: string | null;
  beneficiary: string; shares: string | number; recipient: string | null;
  start_date: string | number | null; lock_duration: string | number | null; is_unlocked: boolean;
};

function rowsOf(r: unknown): RawRow[] {
  return (r as { rows?: RawRow[] }).rows ?? (r as RawRow[]);
}

export async function readFeeStreamsForWallets(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<FeeStreamRow[]> {
  const lower = [...new Set(wallets.map((w) => w.toLowerCase()))];
  if (lower.length === 0 || !DOPPLER_FEE_LOCKER[chainId]) return [];
  try {
    const r = await db.execute(sql`
      SELECT chain_id, locker, pool_id, currency0, currency1, beneficiary, shares,
             recipient, start_date, lock_duration, is_unlocked
        FROM doppler_fee_streams
       WHERE chain_id = ${chainId} AND beneficiary IN ${lower}
    `);
    return rowsOf(r).map((x) => ({
      chainId:      x.chain_id as SupportedChainId,
      locker:       x.locker.toLowerCase(),
      poolId:       x.pool_id.toLowerCase() as `0x${string}`,
      currency0:    x.currency0 ? x.currency0.toLowerCase() : null,
      currency1:    x.currency1 ? x.currency1.toLowerCase() : null,
      beneficiary:  x.beneficiary.toLowerCase(),
      shares:       BigInt(String(x.shares ?? "0").split(".")[0]),
      recipient:    x.recipient,
      startDate:    x.start_date == null ? null : Number(x.start_date),
      lockDuration: x.lock_duration == null ? null : Number(x.lock_duration),
      isUnlocked:   Boolean(x.is_unlocked),
    }));
  } catch (err) {
    console.error(`[doppler-fees/${chainId}] registry read failed:`, err);
    return [];
  }
}

// ─── Live claimable ───────────────────────────────────────────────────────────

export interface FeeOwedSide {
  address:      string;   // token address, or NATIVE_CURRENCY
  symbol:       string;
  decimals:     number;
  claimableRaw: string;   // base units
  claimableUsd: number | null;
}

export interface FeeOwed {
  chainId:      SupportedChainId;
  locker:       string;
  poolId:       string;
  beneficiary:  string;
  /** Percentage of the pool's fees this wallet is entitled to (0-100). */
  sharePct:     number;
  sides:        FeeOwedSide[];
  claimableUsd: number | null;
  /** True once the liquidity itself has been released; fees still flow. */
  isUnlocked:   boolean;
}

/**
 * Everything a set of wallets can claim from Doppler fee streams on one
 * chain, priced. Empty on any failure; never throws (scan callers fan out
 * across chains and must not be blocked by one bad RPC).
 */
export async function readFeesOwed(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<FeeOwed[]> {
  const rows = await readFeeStreamsForWallets(wallets, chainId);
  if (rows.length === 0) return [];
  const locker = DOPPLER_FEE_LOCKER[chainId]!;
  const client = makeFallbackClient(chainId, { batch: true });
  if (!client) return [];

  // 5 reads per row. Page to keep responses under free-RPC caps.
  const live = new Map<string, { cum0: bigint; cum1: bigint; last0: bigint; last1: bigint; shares: bigint }>();
  const PAGE = 20;
  for (let s = 0; s < rows.length; s += PAGE) {
    const page = rows.slice(s, s + PAGE);
    const contracts = page.flatMap((r) => {
      const b = r.beneficiary as `0x${string}`;
      return [
        { address: locker, abi: FEE_LOCKER_ABI, functionName: "getCumulatedFees0" as const, args: [r.poolId] as const },
        { address: locker, abi: FEE_LOCKER_ABI, functionName: "getCumulatedFees1" as const, args: [r.poolId] as const },
        { address: locker, abi: FEE_LOCKER_ABI, functionName: "getLastCumulatedFees0" as const, args: [r.poolId, b] as const },
        { address: locker, abi: FEE_LOCKER_ABI, functionName: "getLastCumulatedFees1" as const, args: [r.poolId, b] as const },
        { address: locker, abi: FEE_LOCKER_ABI, functionName: "getShares" as const, args: [r.poolId, b] as const },
      ];
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await client.multicall({ contracts: contracts as any, allowFailure: true });
      page.forEach((r, i) => {
        const [c0, c1, l0, l1, sh] = res.slice(i * 5, i * 5 + 5);
        if ([c0, c1, l0, l1, sh].some((x) => x.status !== "success")) return;
        live.set(`${r.poolId}:${r.beneficiary}`, {
          cum0: c0.result as bigint, cum1: c1.result as bigint,
          last0: l0.result as bigint, last1: l1.result as bigint,
          shares: sh.result as bigint,
        });
      });
    } catch (err) {
      console.error(`[doppler-fees/${chainId}] live multicall:`, err);
    }
  }
  if (live.size === 0) return [];

  // Token metadata + prices for every side we will show.
  const tokenAddrs = new Set<string>();
  for (const r of rows) for (const c of [r.currency0, r.currency1]) if (c && c !== NATIVE_CURRENCY) tokenAddrs.add(c);
  const meta = await fetchTokenMeta([...tokenAddrs], chainId);
  const priceAddrs = [...tokenAddrs];
  const wrapped = WRAPPED_NATIVE[chainId];
  if (wrapped) priceAddrs.push(wrapped);
  const prices = await getQuickUsdPrices(priceAddrs.map((address) => ({ chainId, address }))).catch(() => new Map());

  const out: FeeOwed[] = [];
  for (const r of rows) {
    const st = live.get(`${r.poolId}:${r.beneficiary}`);
    if (!st) continue;
    // The chain is authoritative for shares; the registry copy is only a hint.
    const shares = st.shares > 0n ? st.shares : r.shares;
    if (shares === 0n) continue;

    const side = (currency: string | null, cum: bigint, last: bigint): FeeOwedSide | null => {
      if (!currency) return null;
      const claimable = feeShare(cum, last, shares);
      const native = currency === NATIVE_CURRENCY;
      const m = native ? { symbol: "ETH", decimals: 18 } : (meta.get(currency) ?? { symbol: "???", decimals: 18 });
      const priceKey = native ? wrapped : currency;
      const price = priceKey ? prices.get(`${chainId}:${priceKey.toLowerCase()}`) : undefined;
      return {
        address:      currency,
        symbol:       m.symbol,
        decimals:     m.decimals,
        claimableRaw: claimable.toString(),
        claimableUsd: toUsdValue(claimable.toString(), m.decimals, price),
      };
    };
    const sides = [side(r.currency0, st.cum0, st.last0), side(r.currency1, st.cum1, st.last1)]
      .filter((x): x is FeeOwedSide => x !== null);
    if (sides.every((x) => x.claimableRaw === "0")) continue; // nothing waiting: say nothing

    const usd = sides.reduce<number | null>((acc, x) => (x.claimableUsd == null ? acc : (acc ?? 0) + x.claimableUsd), null);
    out.push({
      chainId,
      locker,
      poolId:       r.poolId,
      beneficiary:  r.beneficiary,
      sharePct:     Number((shares * 10_000n) / WAD) / 100,
      sides,
      claimableUsd: usd,
      isUnlocked:   r.isUnlocked,
    });
  }
  return out.sort((a, b) => (b.claimableUsd ?? 0) - (a.claimableUsd ?? 0));
}

/** All chains with a locker, for the scan route. */
export const DOPPLER_FEE_CHAINS: SupportedChainId[] =
  Object.keys(DOPPLER_FEE_LOCKER).map(Number) as SupportedChainId[];
