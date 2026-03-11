import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS, computeLinearVesting, nextUnlockTime } from "../types";

// Team Finance subgraph endpoints per chain.
// Official subgraphs: https://thegraph.com/explorer (search "team finance")
// Set env vars to activate each chain.
const SUBGRAPH_URLS: Record<SupportedChainId, string | undefined> = {
  [CHAIN_IDS.ETHEREUM]:     process.env.TEAM_FINANCE_SUBGRAPH_URL_ETH,
  [CHAIN_IDS.BSC]:          process.env.TEAM_FINANCE_SUBGRAPH_URL_BSC,
  [CHAIN_IDS.BASE]:         process.env.TEAM_FINANCE_SUBGRAPH_URL_BASE,
  [CHAIN_IDS.SEPOLIA]:      undefined, // No Team Finance deployment on Sepolia
  [CHAIN_IDS.BASE_SEPOLIA]: undefined, // No Team Finance deployment on Base Sepolia
};

// Team Finance stores locks, not streams — beneficiary is the recipient field
const LOCKS_QUERY = `
  query GetLocks($recipients: [String!]!) {
    tokenLocks(
      where: { beneficiary_in: $recipients, isWithdrawn: false }
      orderBy: startTime
      orderDirection: asc
      first: 200
    ) {
      id
      lockId
      beneficiary
      token { id symbol decimals }
      amount
      withdrawnAmount
      startTime
      endTime
      cliffTime
      isWithdrawn
    }
  }
`;

interface RawLock {
  id: string;
  lockId: string;
  beneficiary: string;
  token: { id: string; symbol: string; decimals: number };
  amount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
  cliffTime: string | null;
  isWithdrawn: boolean;
}

async function fetchForChain(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]> {
  const url = SUBGRAPH_URLS[chainId];
  if (!url) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());

  let json: { data?: { tokenLocks?: RawLock[] }; errors?: unknown };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: LOCKS_QUERY, variables: { recipients: lowercased } }),
      next: { revalidate: 60 },
    });
    if (!res.ok) { console.error(`Team Finance subgraph (chain ${chainId}) HTTP ${res.status}`); return []; }
    json = await res.json();
  } catch (err) {
    console.error(`Team Finance subgraph (chain ${chainId}) fetch error:`, err);
    return [];
  }

  if (json.errors) { console.error(`Team Finance subgraph (chain ${chainId}) errors:`, json.errors); return []; }

  const nowSec = Math.floor(Date.now() / 1000);

  return (json.data?.tokenLocks ?? []).map((raw): VestingStream => {
    const startTime = Number(raw.startTime);
    const endTime   = Number(raw.endTime);
    const cliffTime = raw.cliffTime && Number(raw.cliffTime) > startTime ? Number(raw.cliffTime) : null;
    const total     = BigInt(raw.amount);
    const withdrawn = BigInt(raw.withdrawnAmount);

    const { claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(
      total, withdrawn, startTime, endTime, nowSec
    );

    return {
      id:             `team-finance-${chainId}-${raw.lockId}`,
      protocol:       "team-finance",
      chainId,
      recipient:      raw.beneficiary,
      tokenAddress:   raw.token.id,
      tokenSymbol:    raw.token.symbol,
      tokenDecimals:  raw.token.decimals,
      totalAmount:    total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:   claimableNow.toString(),
      lockedAmount:   lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime,
      isFullyVested,
      nextUnlockTime: nextUnlockTime(isFullyVested, nowSec, cliffTime, endTime),
    };
  });
}

export const teamFinanceAdapter: VestingAdapter = {
  id:   "team-finance",
  name: "Team Finance",
  supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.BASE],
  fetch: fetchForChain,
};
