import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS, computeLinearVesting, computeStepVesting, nextUnlockTime, nextUnlockTimeForSteps } from "../types";
import { resolveSubgraphUrl } from "../graph";

// ─── Subgraph URLs ─────────────────────────────────────────────────────────────
// Subgraph IDs are hardcoded as fallbacks; GRAPH_API_KEY is inserted at runtime.
// Override any chain by setting SABLIER_SUBGRAPH_URL_<CHAIN> in .env.local.

const SUBGRAPH_URLS: Record<SupportedChainId, string | undefined> = {
  [CHAIN_IDS.ETHEREUM]:     resolveSubgraphUrl(
                              process.env.SABLIER_SUBGRAPH_URL_ETH,
                              "AvDAMYYHGaEwn9F9585uqq6MM5CfvRtYcb7KjK7LKPCt"
                            ),
  [CHAIN_IDS.BSC]:          resolveSubgraphUrl(
                              process.env.SABLIER_SUBGRAPH_URL_BSC,
                              "A8Vc9hi7j45u7P8Uw5dg4uqYJgPo4x1rB4oZtTVaiccK"
                            ),
  [CHAIN_IDS.BASE]:         resolveSubgraphUrl(
                              process.env.SABLIER_SUBGRAPH_URL_BASE ?? process.env.SABLIER_SUBGRAPH_URL,
                              "778GfecD9tsyB4xNnz4wfuAyfHU6rqGr79VCPZKu3t2F"
                            ),
  // Sepolia testnet — Sablier Lockup V2.1 (different schema from mainnet V2)
  [CHAIN_IDS.SEPOLIA]:      resolveSubgraphUrl(
                              process.env.SABLIER_SUBGRAPH_URL_SEPOLIA,
                              "5yDtFSxyRuqyjvGJyyuQhMEW3Uah7Ddy2KFSKVhy9VMa"
                            ),
  [CHAIN_IDS.BASE_SEPOLIA]: undefined, // No Sablier deployment on Base Sepolia
};

// Chains that run the V2.1 subgraph schema.
// V2.1 differences vs V2:
//   • `asset { id symbol decimals }` instead of `token { id symbol decimals }`
//   • `subgraphId` instead of `streamId`
//   • `cliff` is a Boolean flag; cliff timestamp is the separate `cliffTime` field
//   • `recipient` is Bytes type → variable must be `[Bytes!]!`
// All current mainnet deployments (ETH, BSC, Base) use V2.1. Only older Sepolia is also V2.1.
const V2_1_CHAINS = new Set<SupportedChainId>([
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.BASE,
  CHAIN_IDS.SEPOLIA,
]);

// ─── V2 Query (mainnet: Ethereum / BSC / Base) ─────────────────────────────────

const STREAMS_QUERY_V2 = `
  query GetStreams($recipients: [String!]!) {
    streams(
      where: { recipient_in: $recipients, canceled: false }
      orderBy: startTime
      orderDirection: asc
      first: 200
    ) {
      id
      streamId
      recipient
      token { id symbol decimals }
      depositAmount
      withdrawnAmount
      startTime
      endTime
      cliff
      canceled
      cancelable
      withdrawals(first: 20, orderBy: timestamp, orderDirection: desc) {
        amount
        timestamp
      }
    }
  }
`;

interface RawStreamV2 {
  id: string;
  streamId: string;
  recipient: string;
  token: { id: string; symbol: string; decimals: number };
  depositAmount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
  cliff: string | null; // timestamp string in V2
  canceled: boolean;
  cancelable: boolean;
  withdrawals?: Array<{ amount: string; timestamp: string }> | null;
}

// ─── V2.1 Query (Sepolia testnet) ──────────────────────────────────────────────

// V2.1 uses an `actions` entity (category = "Withdraw") instead of a dedicated `withdrawals` type.
// Introspection confirmed: Action.amountA holds the withdrawn amount; Action.timestamp is unix seconds.
const STREAMS_QUERY_V2_1 = `
  query GetStreams($recipients: [Bytes!]!) {
    streams(
      where: { recipient_in: $recipients, canceled: false }
      orderBy: startTime
      orderDirection: asc
      first: 200
    ) {
      id
      subgraphId
      recipient
      asset { id symbol decimals }
      depositAmount
      withdrawnAmount
      startTime
      endTime
      cliff
      cliffTime
      canceled
      cancelable
      category
      tranches { amount endTime }
      actions(where: { category: Withdraw }, first: 20, orderBy: timestamp, orderDirection: desc) {
        amountA
        timestamp
      }
    }
  }
`;

interface RawStreamV2_1 {
  id: string;
  subgraphId: string;
  recipient: string;
  asset: { id: string; symbol: string; decimals: number };
  depositAmount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
  cliff: boolean | null;     // Boolean flag in V2.1
  cliffTime: string | null;  // Separate timestamp field in V2.1
  canceled: boolean;
  cancelable: boolean;
  category: string | null;   // "LockupLinear" | "LockupTranched" | "LockupDynamic" | null
  tranches: Array<{ amount: string; endTime: string }> | null;
  actions?: Array<{ amountA: string | null; timestamp: string }> | null;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());
  const isV2_1     = V2_1_CHAINS.has(chainId);
  const query      = isV2_1 ? STREAMS_QUERY_V2_1 : STREAMS_QUERY_V2;

  let json: { data?: { streams?: unknown[] }; errors?: unknown };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({ query, variables: { recipients: lowercased } }),
      next: { revalidate: 60 },
    });
    if (!res.ok) { console.error(`Sablier subgraph (chain ${chainId}) HTTP ${res.status}`); return []; }
    json = await res.json();
  } catch (err) {
    console.error(`Sablier subgraph (chain ${chainId}) fetch error:`, err);
    return [];
  }

  if (json.errors) { console.error(`Sablier subgraph (chain ${chainId}) errors:`, json.errors); return []; }

  const nowSec    = Math.floor(Date.now() / 1000);
  const rawStreams = json.data?.streams ?? [];

  // ── V2.1 mapping (Sepolia) ─────────────────────────────────────────────────
  if (isV2_1) {
    return (rawStreams as RawStreamV2_1[]).map((raw): VestingStream => {
      const startTime = Number(raw.startTime);
      const endTime   = Number(raw.endTime);
      // cliffTime is a separate field in V2.1; cliff is just a boolean flag
      const cliffTime = raw.cliffTime && Number(raw.cliffTime) > startTime
        ? Number(raw.cliffTime)
        : null;
      const total     = BigInt(raw.depositAmount);
      const withdrawn = BigInt(raw.withdrawnAmount);

      // Detect step/tranched streams (Sablier LockupTranched)
      const isStepStream = raw.category === "LockupTranched" && raw.tranches && raw.tranches.length > 0;
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
        tokenAddress:    raw.asset.id,
        tokenSymbol:     raw.asset.symbol,
        tokenDecimals:   raw.asset.decimals,
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
              .filter((a) => a.amountA != null)
              .map((a) => ({ timestamp: Number(a.timestamp), amount: a.amountA! }))
          : undefined,
      };
    });
  }

  // ── V2 mapping (Ethereum / BSC / Base) ────────────────────────────────────
  return (rawStreams as RawStreamV2[]).map((raw): VestingStream => {
    const startTime = Number(raw.startTime);
    const endTime   = Number(raw.endTime);
    // In V2, cliff IS the timestamp (or null)
    const cliffTime = raw.cliff && Number(raw.cliff) > startTime ? Number(raw.cliff) : null;
    const total     = BigInt(raw.depositAmount);
    const withdrawn = BigInt(raw.withdrawnAmount);

    const { claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(
      total, withdrawn, startTime, endTime, nowSec
    );

    return {
      id:              `sablier-${chainId}-${raw.streamId}`,
      protocol:        "sablier",
      chainId,
      recipient:       raw.recipient,
      tokenAddress:    raw.token.id,
      tokenSymbol:     raw.token.symbol,
      tokenDecimals:   raw.token.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, cliffTime, endTime),
      cancelable:      raw.cancelable,
      claimEvents:     raw.withdrawals
        ? raw.withdrawals.map((w) => ({ timestamp: Number(w.timestamp), amount: w.amount }))
        : undefined,
    };
  });
}

export const sablierAdapter: VestingAdapter = {
  id:   "sablier",
  name: "Sablier",
  supportedChainIds: [
    CHAIN_IDS.ETHEREUM,
    CHAIN_IDS.BSC,
    CHAIN_IDS.BASE,
    CHAIN_IDS.SEPOLIA,
  ],
  fetch: fetchForChain,
};
