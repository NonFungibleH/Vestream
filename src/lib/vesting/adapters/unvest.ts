import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS, computeLinearVesting, computeStepVesting, nextUnlockTime, nextUnlockTimeForSteps } from "../types";
import { resolveSubgraphUrl } from "../graph";

// ─── Subgraph URLs ─────────────────────────────────────────────────────────────
// Subgraph IDs are hardcoded as fallbacks; GRAPH_API_KEY is inserted at runtime.
const SUBGRAPH_URLS: Record<SupportedChainId, string | undefined> = {
  [CHAIN_IDS.ETHEREUM]:     resolveSubgraphUrl(
                              process.env.UNVEST_SUBGRAPH_URL_ETH,
                              "HR7owbk45vXNgf8XXyDd7fRLuVo6QGYY6XbGjRCPgUuD"
                            ),
  [CHAIN_IDS.BSC]:          resolveSubgraphUrl(
                              process.env.UNVEST_SUBGRAPH_URL_BSC,
                              "5RiFDxL1mDFdSojrC7tRkVXqiiQgysf77iC7c1KK5CAp"
                            ),
  [CHAIN_IDS.BASE]:         resolveSubgraphUrl(
                              process.env.UNVEST_SUBGRAPH_URL_BASE,
                              "8DdThKxMS2LxEtyDCdwqtecwRu4qD8GbE77n3ANvkN2M"
                            ),
  [CHAIN_IDS.SEPOLIA]:      undefined,
  // Base Sepolia testnet — Unvest V3 (legacy tokenLocks schema)
  [CHAIN_IDS.BASE_SEPOLIA]: resolveSubgraphUrl(
                              process.env.UNVEST_SUBGRAPH_URL_BASE_SEPOLIA,
                              "CZxkjYEnom7ijhKv77n3Qf2WGuPMLkfVsyZzRB6EhMmP"
                            ),
};

// ─── Schema variants ───────────────────────────────────────────────────────────
// Mainnet (ETH/BSC/Base) uses the newer HolderBalance schema introduced in Unvest V3.1+.
// Base Sepolia testnet uses the older tokenLocks schema (Unvest V3).
const LEGACY_CHAINS = new Set<SupportedChainId>([CHAIN_IDS.BASE_SEPOLIA]);

// ─── Mainnet query (HolderBalance schema) ──────────────────────────────────────
// Introspection confirmed: holderBalances(where: { user_in, isRecipient: true })
const MAINNET_QUERY = `
  query GetHolderBalances($recipients: [String!]!) {
    holderBalances(
      where: { user_in: $recipients, isRecipient: true }
      orderBy: updatedAt
      orderDirection: asc
      first: 200
    ) {
      id
      user
      allocation
      claimed
      claimable
      locked
      vestingToken {
        id
        underlyingToken {
          id
          symbol
          decimals
        }
        milestones(orderBy: timestamp, orderDirection: asc) {
          timestamp
          percentage
        }
      }
    }
  }
`;

interface RawHolderBalance {
  id:         string;
  user:       string;
  allocation: string;
  claimed:    string;
  claimable:  string;
  locked:     string;
  vestingToken: {
    id: string;
    underlyingToken: { id: string; symbol: string; decimals: number };
    milestones: Array<{ timestamp: string; percentage: string }>;
  };
}

// ─── Legacy query (tokenLocks schema — Base Sepolia only) ─────────────────────
const LEGACY_QUERY = `
  query GetLocks($recipients: [String!]!) {
    tokenLocks(
      where: { beneficiary_in: $recipients }
      orderBy: startEmission
      orderDirection: asc
      first: 200
    ) {
      id
      lockID
      beneficiary
      token { id symbol decimals }
      sharesDeposited
      sharesWithdrawn
      startEmission
      endEmission
    }
  }
`;

interface RawLock {
  id: string;
  lockID: string;
  beneficiary: string;
  token: { id: string; symbol: string; decimals: number };
  sharesDeposited: string;
  sharesWithdrawn: string;
  startEmission: string;
  endEmission: string;
}

// ─── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());
  const isLegacy   = LEGACY_CHAINS.has(chainId);
  const query      = isLegacy ? LEGACY_QUERY : MAINNET_QUERY;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: { data?: any; errors?: unknown };
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, variables: { recipients: lowercased } }),
      next:    { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`Unvest subgraph (chain ${chainId}) HTTP ${res.status}`);
      return [];
    }
    json = await res.json();
  } catch (err) {
    console.error(`Unvest subgraph (chain ${chainId}) fetch error:`, err);
    return [];
  }

  if (json.errors) {
    console.error(`Unvest subgraph (chain ${chainId}) GraphQL errors:`, JSON.stringify(json.errors, null, 2));
    return [];
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // ── Mainnet: HolderBalance schema ─────────────────────────────────────────
  if (!isLegacy) {
    const holders: RawHolderBalance[] = json.data?.holderBalances ?? [];
    return holders.map((raw): VestingStream => {
      const milestones = raw.vestingToken?.milestones ?? [];
      const token      = raw.vestingToken?.underlyingToken;

      // startTime / endTime from first/last milestone
      const startTime  = milestones.length > 0 ? Number(milestones[0].timestamp) : 0;
      const endTime    = milestones.length > 0 ? Number(milestones[milestones.length - 1].timestamp) : 0;

      const total      = BigInt(raw.allocation);
      const withdrawn  = BigInt(raw.claimed);

      let claimableNow: bigint;
      let lockedAmount: bigint;
      let isFullyVested: boolean;

      // totalPct declared here so it's accessible for both step vesting and unlockSteps below
      const totalPct = milestones.length > 0
        ? milestones.reduce((s, m) => s + BigInt(m.percentage), 0n)
        : 0n;

      if (milestones.length > 0) {
        // Compute vesting from milestone schedule (steps based on percentage).
        // Unvest stores percentages as scaled integers; we normalise to absolute amounts
        // by computing the cumulative % unlocked at each milestone, then deriving amounts.
        const steps = milestones.map((m) => ({
          timestamp: Number(m.timestamp),
          // amount = allocation * milestone_pct / total_pct  (avoids needing to know scale)
          amount: totalPct > 0n ? ((total * BigInt(m.percentage)) / totalPct).toString() : "0",
        }));
        ({ claimableNow, lockedAmount, isFullyVested } =
          computeStepVesting(total, withdrawn, steps, nowSec));
      } else {
        // No milestones — fall back to subgraph pre-computed values
        claimableNow  = BigInt(raw.claimable);
        lockedAmount  = BigInt(raw.locked);
        isFullyVested = lockedAmount === 0n && claimableNow === 0n && withdrawn > 0n;
      }

      const unlockSteps = milestones.length > 0
        ? milestones.map((m) => ({
            timestamp: Number(m.timestamp),
            amount:    (totalPct > 0n
                          ? (total * BigInt(m.percentage)) / totalPct
                          : 0n
                       ).toString(),
          }))
        : undefined;

      return {
        id:              `unvest-${chainId}-${raw.id}`,
        protocol:        "unvest",
        chainId,
        recipient:       raw.user,
        tokenAddress:    token?.id    ?? "",
        tokenSymbol:     token?.symbol ?? "???",
        tokenDecimals:   token?.decimals ?? 18,
        totalAmount:     total.toString(),
        withdrawnAmount: withdrawn.toString(),
        claimableNow:    claimableNow.toString(),
        lockedAmount:    lockedAmount.toString(),
        startTime,
        endTime,
        cliffTime:       null,
        isFullyVested,
        nextUnlockTime:  unlockSteps
          ? nextUnlockTimeForSteps(nowSec, unlockSteps)
          : nextUnlockTime(isFullyVested, nowSec, null, endTime),
        shape:       milestones.length > 0 ? "steps" : "linear",
        unlockSteps: milestones.length > 0 ? unlockSteps : undefined,
      };
    });
  }

  // ── Legacy: tokenLocks schema (Base Sepolia only) ─────────────────────────
  const locks: RawLock[] = json.data?.tokenLocks ?? [];
  return locks.map((raw): VestingStream => {
    const startTime = Number(raw.startEmission);
    const endTime   = Number(raw.endEmission);
    const total     = BigInt(raw.sharesDeposited);
    const withdrawn = BigInt(raw.sharesWithdrawn);

    const { claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(
      total, withdrawn, startTime, endTime, nowSec
    );

    return {
      id:              `unvest-${chainId}-${raw.lockID}`,
      protocol:        "unvest",
      chainId,
      recipient:       raw.beneficiary,
      tokenAddress:    raw.token.id,
      tokenSymbol:     raw.token.symbol,
      tokenDecimals:   raw.token.decimals,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime:       null,
      isFullyVested,
      nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, null, endTime),
    };
  });
}

export const unvestAdapter: VestingAdapter = {
  id:   "unvest",
  name: "Unvest",
  supportedChainIds: [
    CHAIN_IDS.ETHEREUM,
    CHAIN_IDS.BSC,
    CHAIN_IDS.BASE,
    CHAIN_IDS.BASE_SEPOLIA,
  ],
  fetch: fetchForChain,
};
