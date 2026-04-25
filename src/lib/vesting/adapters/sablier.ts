import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS, computeLinearVesting, computeStepVesting, nextUnlockTime, nextUnlockTimeForSteps } from "../types";

// ─── Envio endpoint (replaces the old per-chain The Graph subgraphs) ─────────
//
// Sablier migrated their indexing stack from The Graph to Envio HyperIndex
// some time in 2025. The old hosted subgraph endpoints — both V2 mainnet and
// V2.1 — stopped returning data; the root `streams` query field is gone
// and requests now error with `Type 'Query' has no field 'streams'`.
//
// Envio exposes a SINGLE multi-chain Hasura endpoint for all Sablier Lockup
// deployments. You filter by `chainId` inside the query instead of hitting a
// different URL per network. The entity names and field shape changed:
//
//   Old subgraph (The Graph)        →   New Hasura (Envio)
//   query { streams(...) { ... } }  →   query { LockupStream(...) { ... } }
//   where: { recipient_in: [...] }  →   where: { recipient: { _in: [...] } }
//   orderBy: startTime              →   order_by: { startTime: asc }
//   first: 200                      →   limit: 200
//   token { id symbol decimals }    →   asset { address symbol decimals }
//   withdrawals { amount ts }       →   actions(where:{category:{_eq:"Withdraw"}}){ amountB timestamp }
//
// `subgraphId` is preserved on LockupStream, and matches the value the old
// subgraph exposed — so our stable stream IDs (`sablier-{chainId}-{streamId}`)
// stay valid across the migration; existing cache rows don't need rekeying.
const SABLIER_ENVIO_URL =
  process.env.SABLIER_ENVIO_URL ?? "https://indexer.hyperindex.xyz/53b7e25/v1/graphql";

// Every mainnet + Sepolia Sablier deployment is on the same Envio endpoint;
// per-chain scoping happens inside the query via `where: {chainId: {_eq: $cid}}`.
const SUPPORTED_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.SEPOLIA,
];

// ─── Query ─────────────────────────────────────────────────────────────────────
//
// Hasura/Envio flavour. `numeric!` is Envio's BigDecimal-ish type — JSON
// numbers and strings both work for the variable; we pass a number for
// clarity. Asset.decimals and all timestamps come back as strings
// (Hasura's default for numeric), so every consumer coerces with Number().

const STREAMS_QUERY = /* GraphQL */ `
  query GetStreams($recipients: [String!]!, $chainId: numeric!) {
    LockupStream(
      where: {
        chainId:  { _eq: $chainId }
        recipient: { _in: $recipients }
        canceled:  { _eq: false }
      }
      order_by: { startTime: asc }
      limit: 200
    ) {
      subgraphId
      chainId
      recipient
      asset { address symbol decimals }
      depositAmount
      withdrawnAmount
      startTime
      endTime
      cliff
      cliffTime
      canceled
      cancelable
      category
      tranches {
        amount
        endTime
      }
      actions(
        where: { category: { _eq: "Withdraw" } }
        limit: 20
        order_by: { timestamp: desc }
      ) {
        amountB
        timestamp
      }
    }
  }
`;

interface RawLockupStream {
  subgraphId:      string;
  chainId:         string;
  recipient:       string;
  asset:           { address: string; symbol: string; decimals: string };
  depositAmount:   string;
  withdrawnAmount: string;
  startTime:       string;
  endTime:         string;
  cliff:           boolean | null;    // Boolean flag, separate from cliffTime
  cliffTime:       string | null;     // actual cliff timestamp, null if no cliff
  canceled:        boolean;
  cancelable:      boolean;
  category:        string | null;     // "LockupLinear" | "LockupTranched" | "LockupDynamic"
  tranches:        Array<{ amount: string; endTime: string }> | null;
  // LockupAction is polymorphic — Withdraw actions keep the amount in `amountB`.
  actions?:        Array<{ amountB: string | null; timestamp: string }> | null;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  if (!SUPPORTED_CHAINS.includes(chainId)) return [];
  if (wallets.length === 0) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());

  let json: { data?: { LockupStream?: RawLockupStream[] }; errors?: unknown };
  try {
    const res = await fetch(SABLIER_ENVIO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({
        query:     STREAMS_QUERY,
        variables: { recipients: lowercased, chainId },
      }),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`Sablier/Envio (chain ${chainId}) HTTP ${res.status}`);
      return [];
    }
    json = await res.json();
  } catch (err) {
    console.error(`Sablier/Envio (chain ${chainId}) fetch error:`, err);
    return [];
  }

  if (json.errors) {
    console.error(`Sablier/Envio (chain ${chainId}) errors:`, JSON.stringify(json.errors).slice(0, 300));
    return [];
  }

  const nowSec     = Math.floor(Date.now() / 1000);
  const rawStreams = json.data?.LockupStream ?? [];

  return rawStreams.map((raw): VestingStream => {
    const startTime = Number(raw.startTime);
    const endTime   = Number(raw.endTime);
    // cliff is a Boolean; cliffTime is the real timestamp (null if no cliff).
    const cliffTime = raw.cliffTime && Number(raw.cliffTime) > startTime
      ? Number(raw.cliffTime)
      : null;
    const total     = BigInt(raw.depositAmount);
    const withdrawn = BigInt(raw.withdrawnAmount);

    // LockupTranched = step/milestone vesting. Tranches carry their own end
    // times + amounts; vesting math uses computeStepVesting instead of linear.
    const isStepStream = raw.category === "LockupTranched" && Array.isArray(raw.tranches) && raw.tranches.length > 0;
    const unlockSteps  = isStepStream
      ? raw.tranches!
          .map((t) => ({ timestamp: Number(t.endTime), amount: t.amount }))
          .sort((a, b) => a.timestamp - b.timestamp)
      : undefined;

    let claimableNow: bigint, lockedAmount: bigint, isFullyVested: boolean;
    if (isStepStream && unlockSteps) {
      ({ claimableNow, lockedAmount, isFullyVested } = computeStepVesting(total, withdrawn, unlockSteps, nowSec));
    } else {
      ({ claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(total, withdrawn, startTime, endTime, nowSec));
    }

    return {
      id:              `sablier-${chainId}-${raw.subgraphId}`,
      protocol:        "sablier",
      chainId,
      recipient:       raw.recipient,
      tokenAddress:    raw.asset.address,
      tokenSymbol:     raw.asset.symbol,
      tokenDecimals:   Number(raw.asset.decimals),
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  isStepStream && unlockSteps
        ? nextUnlockTimeForSteps(nowSec, unlockSteps)
        : nextUnlockTime(isFullyVested, nowSec, cliffTime, endTime),
      cancelable:      raw.cancelable,
      shape:           isStepStream ? "steps" : "linear",
      unlockSteps,
      claimEvents:     raw.actions
        ? raw.actions
            .filter((a) => a.amountB != null)
            .map((a) => ({ timestamp: Number(a.timestamp), amount: a.amountB! }))
        : undefined,
    };
  });
}

export const sablierAdapter: VestingAdapter = {
  id:   "sablier",
  name: "Sablier",
  supportedChainIds: SUPPORTED_CHAINS,
  fetch: fetchForChain,
};
