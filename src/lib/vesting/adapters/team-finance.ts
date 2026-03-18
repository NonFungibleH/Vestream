/**
 * Team Finance V3 adapter
 *
 * Data sources:
 *  • REST API  – https://team-finance-backend-dev-origdfl2wq-uc.a.run.app
 *    GET /api/app/vesting/{user}  →  per-user vestings across all chains
 *
 *  • Squid GQL – https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql
 *    vestingClaims  →  individual claim events (used to derive withdrawnAmount)
 *
 * Chains: Ethereum (1), BSC (56), Base (8453), Sepolia (11155111)
 */

import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS, nextUnlockTime } from "../types";

// ─── Endpoints ───────────────────────────────────────────────────────────────

const REST_BASE  = "https://team-finance-backend-dev-origdfl2wq-uc.a.run.app";
const SQUID_URL  = "https://teamfinance.squids.live/tf-vesting-staking-subgraph:prod/api/graphql";

// ─── REST API types ───────────────────────────────────────────────────────────

interface TFApiResponse {
  data:   TFVesting[];
  stats?: unknown;
}

interface TFVesting {
  address:           string;  // vesting contract address
  token:             string;  // token contract address
  tokenDecimals:     number;
  tokenSymbol:       string;
  chainId:           string;  // hex, e.g. "0x1", "0x38", "0x2105", "0xaa36a7"
  userTotal:         string;  // hex bigint, e.g. "0x083d6c7aab63600000"
  start:             number;  // unix seconds
  end:               number;  // unix seconds
  cadence:           number;  // 1 = continuous linear
  percentageOnStart: number;  // 0–100: portion that unlocks immediately at start
  revocable:         boolean;
  version:           string;  // "v3"
}

// ─── Module-level cache (shared across per-chain calls for the same wallet) ──

interface CacheEntry { ts: number; vestings: TFVesting[] }
const _walletCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 s

async function fetchWalletVestings(wallet: string): Promise<TFVesting[]> {
  // Normalise to lowercase — the REST API is case-sensitive on the address path
  const addr  = wallet.toLowerCase();
  const entry = _walletCache.get(addr);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.vestings;

  try {
    const res = await fetch(`${REST_BASE}/api/app/vesting/${addr}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`Team Finance REST (wallet ${addr}) HTTP ${res.status}`);
      return [];
    }
    const parsed: unknown = await res.json();
    // API returns { data: TFVesting[], stats: {} } — handle both shapes for resilience
    let vestings: TFVesting[];
    if (Array.isArray(parsed)) {
      vestings = parsed as TFVesting[];
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as TFApiResponse).data)) {
      vestings = (parsed as TFApiResponse).data;
    } else {
      vestings = [];
    }
    _walletCache.set(addr, { ts: Date.now(), vestings });
    return vestings;
  } catch (err) {
    console.error("Team Finance REST fetch error:", err);
    return [];
  }
}

// ─── Squid claim history ──────────────────────────────────────────────────────

const CLAIMS_QUERY = `
  query GetClaims($accounts: [String!]!, $vestings: [String!]!, $chainId: Int!) {
    vestingClaims(
      where: {
        account_in:  $accounts
        vesting_in:  $vestings
        chainId_eq:  $chainId
      }
      limit: 1000
    ) {
      account
      vesting
      amount
      timestamp
    }
  }
`;

interface RawClaim {
  account:   string;
  vesting:   string;
  amount:    string; // bigint as string
  timestamp: string; // bigint as string
}

/** Returns a map of `"account:vestingAddr"` → total withdrawn (BigInt) */
async function fetchClaims(
  accounts:        string[],
  vestingAddresses: string[],
  chainId:         number,
): Promise<Map<string, bigint>> {
  if (vestingAddresses.length === 0) return new Map();

  try {
    const res = await fetch(SQUID_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({
        query:     CLAIMS_QUERY,
        variables: { accounts, vestings: vestingAddresses, chainId },
      }),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`Team Finance squid HTTP ${res.status}`);
      return new Map();
    }
    const json = await res.json();
    if (json.errors) {
      console.error("Team Finance squid errors:", json.errors);
      return new Map();
    }
    const claims: RawClaim[] = json.data?.vestingClaims ?? [];

    const result = new Map<string, bigint>();
    for (const c of claims) {
      const key = `${c.account.toLowerCase()}:${c.vesting.toLowerCase()}`;
      result.set(key, (result.get(key) ?? 0n) + BigInt(c.amount));
    }
    return result;
  } catch (err) {
    console.error("Team Finance squid fetch error:", err);
    return new Map();
  }
}

// ─── Claim events ─────────────────────────────────────────────────────────────

const CLAIM_EVENTS_QUERY = `
  query GetClaimEvents($account: String!, $vestings: [String!]!, $chainId: Int!) {
    vestingClaims(
      where: {
        account_eq:  $account
        vesting_in:  $vestings
        chainId_eq:  $chainId
      }
      orderBy: [timestamp_DESC]
      limit: 200
    ) {
      vesting
      amount
      timestamp
    }
  }
`;

async function fetchClaimEvents(
  account:          string,
  vestingAddresses: string[],
  chainId:          number,
): Promise<Map<string, Array<{ timestamp: number; amount: string }>>> {
  if (vestingAddresses.length === 0) return new Map();

  try {
    const res = await fetch(SQUID_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Vestream/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({
        query:     CLAIM_EVENTS_QUERY,
        variables: { account: account.toLowerCase(), vestings: vestingAddresses, chainId },
      }),
      next: { revalidate: 60 },
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const claims: { vesting: string; amount: string; timestamp: string }[] =
      json.data?.vestingClaims ?? [];

    const result = new Map<string, Array<{ timestamp: number; amount: string }>>();
    for (const c of claims) {
      const addr = c.vesting.toLowerCase();
      if (!result.has(addr)) result.set(addr, []);
      result.get(addr)!.push({ timestamp: Number(c.timestamp), amount: c.amount });
    }
    return result;
  } catch {
    return new Map();
  }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

async function fetchForChain(
  wallets:  string[],
  chainId:  SupportedChainId,
): Promise<VestingStream[]> {
  // Fetch vestings for all wallets (REST; results cached cross-chain)
  const perWallet = await Promise.all(wallets.map(fetchWalletVestings));

  // Filter to the requested chain and attach the wallet address.
  // chainId in the REST response can be a hex string ("0x1") or a decimal number (1).
  type Tagged = TFVesting & { walletAddr: string };
  const filtered: Tagged[] = [];
  for (let i = 0; i < wallets.length; i++) {
    for (const v of perWallet[i]) {
      const raw = v.chainId;
      const vChainId = typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.startsWith("0x")
          ? parseInt(raw, 16)
          : Number(raw);
      if (vChainId === chainId) {
        filtered.push({ ...v, walletAddr: wallets[i] });
      }
    }
  }
  if (filtered.length === 0) return [];

  // Fetch claim totals and claim event lists from the squid in one batch per wallet
  const accounts       = [...new Set(filtered.map(v => v.walletAddr.toLowerCase()))];
  const vestingAddrs   = [...new Set(filtered.map(v => v.address.toLowerCase()))];
  const claimTotals    = await fetchClaims(accounts, vestingAddrs, chainId);

  // Fetch per-wallet claim events for claimEvents field
  const claimEventsPerWallet = await Promise.all(
    accounts.map(acc =>
      fetchClaimEvents(
        acc,
        filtered.filter(v => v.walletAddr.toLowerCase() === acc).map(v => v.address.toLowerCase()),
        chainId,
      )
    )
  );
  // Build a combined map: `walletAddr:vestingAddr` → sorted claim events
  const claimEventsMap = new Map<string, Array<{ timestamp: number; amount: string }>>();
  for (let i = 0; i < accounts.length; i++) {
    for (const [addr, events] of claimEventsPerWallet[i]) {
      claimEventsMap.set(`${accounts[i]}:${addr}`, events);
    }
  }

  const nowSec = Math.floor(Date.now() / 1000);

  return filtered.map((v): VestingStream => {
    const walletLower  = v.walletAddr.toLowerCase();
    const addrLower    = v.address.toLowerCase();
    const claimKey     = `${walletLower}:${addrLower}`;

    // Guard against malformed entries (missing required fields)
    const startTime = Number(v.start)  || 0;
    const endTime   = Number(v.end)    || 0;
    if (!v.userTotal || !endTime) return null as unknown as VestingStream; // filtered below

    const total     = BigInt(v.userTotal);
    const withdrawn = claimTotals.get(claimKey) ?? 0n;

    // Linear vesting: percentageOnStart% unlocks at start, rest vests linearly start→end
    // percentageOnStart can be null/undefined in some API responses — default to 0
    const pct          = typeof v.percentageOnStart === "number" && isFinite(v.percentageOnStart)
      ? v.percentageOnStart : 0;
    const bps          = BigInt(Math.round(pct * 100)); // basis points (0..10000)
    const initialUnlock = (total * bps) / 10000n;
    const linearPortion = total - initialUnlock;

    let vested: bigint;
    if (nowSec < startTime || endTime <= startTime) {
      vested = 0n;
    } else if (nowSec >= endTime) {
      vested = total;
    } else {
      const elapsed  = BigInt(nowSec - startTime);
      const duration = BigInt(endTime - startTime);
      vested = initialUnlock + (linearPortion * elapsed) / duration;
    }

    const claimableNow  = vested > withdrawn ? vested - withdrawn : 0n;
    const lockedAmount  = total > vested     ? total  - vested    : 0n;
    const isFullyVested = vested >= total;

    // Use a unique ID: protocol-chain-vestingAddr-walletAddr
    // (multiple wallets can be recipients of the same contract)
    const id = `team-finance-${chainId}-${addrLower}-${walletLower}`;

    return {
      id,
      protocol:        "team-finance",
      chainId,
      recipient:       v.walletAddr,
      tokenAddress:    v.token,
      tokenSymbol:     v.tokenSymbol     ?? "???",
      tokenDecimals:   v.tokenDecimals   ?? 18,
      totalAmount:     total.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimableNow.toString(),
      lockedAmount:    lockedAmount.toString(),
      startTime,
      endTime,
      cliffTime:       null, // TF V3 uses percentageOnStart instead of a cliff date
      isFullyVested,
      nextUnlockTime:  nextUnlockTime(isFullyVested, nowSec, null, endTime),
      cancelable:      v.revocable ?? undefined,
      shape:           "linear",
      claimEvents:     claimEventsMap.get(claimKey),
    };
  }).filter(Boolean) as VestingStream[];
}

// ─── Adapter export ───────────────────────────────────────────────────────────

export const teamFinanceAdapter: VestingAdapter = {
  id:                "team-finance",
  name:              "Team Finance",
  supportedChainIds: [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BSC, CHAIN_IDS.BASE, CHAIN_IDS.SEPOLIA],
  fetch:             fetchForChain,
};
