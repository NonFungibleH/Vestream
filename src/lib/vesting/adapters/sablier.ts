import { VestingAdapter } from "./index";
import { VestingStream, SupportedChainId, CHAIN_IDS, computeLinearVesting, computeStepVesting, nextUnlockTime, nextUnlockTimeForSteps } from "../types";
import { resolveTokenMeta } from "../token-resolver";

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
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.SEPOLIA,
];

// ─── Query ─────────────────────────────────────────────────────────────────────
//
// Hasura/Envio flavour. `numeric!` is Envio's BigDecimal-ish type — JSON
// numbers and strings both work for the variable; we pass a number for
// clarity. Asset.decimals and all timestamps come back as strings
// (Hasura's default for numeric), so every consumer coerces with Number().

// 2026-05-14: added `creationActions` sub-query — same `actions`
// relation filtered on the "Create" category. Sablier streams don't
// expose a top-level `transactionHash` on the LockupStream entity,
// but each stream has an associated Action of category=Create whose
// `hash` field is the originating tx. `limit: 1 order_by: timestamp asc`
// picks the earliest such action (the actual creation, not any later
// renounce/extend). Falls back gracefully when the field is null.
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
      segments {
        position
        startTime
        endTime
        startAmount
        endAmount
        amount
        exponent
      }
      actions(
        where: { category: { _eq: "Withdraw" } }
        limit: 20
        order_by: { timestamp: desc }
      ) {
        amountB
        timestamp
      }
      creationActions: actions(
        where: { category: { _eq: "Create" } }
        limit: 1
        order_by: { timestamp: asc }
      ) {
        hash
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
  // LockupDynamic only — curve segments. `exponent` is 1e18-scaled (1e18 = 1.0
  // = linear; >1e18 = back-loaded/convex; <1e18 = front-loaded/concave).
  // startAmount/endAmount are the EXACT cumulative vested at each segment
  // boundary (Envio computes them), so we anchor to those and interpolate the
  // curve within a segment via the exponent.
  segments:        Array<{
    position:    string;
    startTime:   string;
    endTime:     string;
    startAmount: string;
    endAmount:   string;
    amount:      string;
    exponent:    string;
  }> | null;
  // LockupAction is polymorphic — Withdraw actions keep the amount in `amountB`.
  actions?:         Array<{ amountB: string | null; timestamp: string }> | null;
  // Create action (filtered to category=Create above) — single-element
  // array carrying the originating tx hash. Empty when the upstream
  // index didn't track the create event (very old streams from before
  // Envio added the field).
  creationActions?: Array<{ hash: string | null }> | null;
}

// ─── LockupDynamic curve sampling ────────────────────────────────────────────
// Sablier LockupDynamic vests along a curve defined by segments. Each segment
// releases `amount` between [startTime, endTime] following
//   vested(t) = startAmount + (endAmount - startAmount) · progress ^ exponent
// where progress = (t - startTime) / (endTime - startTime) ∈ [0,1] and
// `exponent` is 1e18-scaled (1e18 ⇒ 1.0 ⇒ linear).
//
// We sample the curve into discrete `unlockSteps` (incremental amounts) so the
// existing "steps" rendering + computeStepVesting handle it — no new chart or
// math path. Endpoints anchor to Envio's exact startAmount/endAmount, so the
// approximation is exact at segment boundaries and smooth in between.
const DYNAMIC_SUBSTEPS = 8;        // sample points per non-linear segment
const EXPONENT_SCALE   = 1e18;     // Sablier SD59x18: 1e18 == exponent 1.0

function sampleDynamicSegments(
  segments: NonNullable<RawLockupStream["segments"]>,
): Array<{ timestamp: number; amount: string }> {
  const steps: Array<{ timestamp: number; amount: string }> = [];
  let prevCum = 0n;

  const ordered = [...segments].sort((a, b) => Number(a.position) - Number(b.position));
  for (const seg of ordered) {
    const segStart = Number(seg.startTime);
    const segEnd   = Number(seg.endTime);
    const startCum = BigInt(seg.startAmount);
    const endCum   = BigInt(seg.endAmount);
    const dur      = segEnd - segStart;

    // Degenerate / instant segment (cliff-like): emit one step at its end.
    if (dur <= 0 || endCum <= startCum) {
      if (endCum > prevCum) {
        steps.push({ timestamp: segEnd, amount: (endCum - prevCum).toString() });
        prevCum = endCum;
      }
      continue;
    }

    const exp      = Number(seg.exponent) / EXPONENT_SCALE;
    const isLinear = Math.abs(exp - 1) < 1e-9;
    const n        = isLinear ? 1 : DYNAMIC_SUBSTEPS;
    const span     = endCum - startCum;

    for (let i = 1; i <= n; i++) {
      const frac = i / n;                              // fraction along segment time
      const ts   = segStart + Math.round(frac * dur);
      // cumulative within segment; at frac=1 → frac^exp=1 → cum=endCum exactly.
      const curveFrac = Math.pow(frac, exp);           // ∈ [0,1]
      const cum = startCum + (span * BigInt(Math.round(curveFrac * 1e9))) / 1_000_000_000n;
      const delta = cum > prevCum ? cum - prevCum : 0n;
      if (delta > 0n) {
        steps.push({ timestamp: ts, amount: delta.toString() });
        prevCum = cum;
      }
    }
  }
  return steps;
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

  // 2026-05-20: resolve any UNKNOWN/empty symbols via on-chain fallback
  // BEFORE constructing the stream objects. Envio's `asset.symbol` field
  // can be null for tokens whose `symbol()` returns bytes32 instead of
  // string (common older-ERC-20 launchpad-token convention). Process the
  // raw rows async-batched first so each unique (chainId, address) only
  // hits chain once even when a wallet has many streams of the same token
  // — the resolver has an internal 24h cache that dedupes within this
  // adapter run.
  const resolutions = await Promise.all(
    rawStreams.map(async (raw) => {
      const subgraphSymbol = raw.asset?.symbol;
      const subgraphDecimals = raw.asset?.decimals != null ? Number(raw.asset.decimals) : null;
      const meta = await resolveTokenMeta(chainId, raw.asset.address, {
        existingSymbol:   subgraphSymbol,
        existingDecimals: subgraphDecimals,
      });
      return { subgraphId: raw.subgraphId, meta };
    }),
  );
  const metaById = new Map(resolutions.map((r) => [r.subgraphId, r.meta]));

  return rawStreams.map((raw): VestingStream => {
    const startTime = Number(raw.startTime);
    const endTime   = Number(raw.endTime);
    // cliff is a Boolean; cliffTime is the real timestamp (null if no cliff).
    const cliffTime = raw.cliffTime && Number(raw.cliffTime) > startTime
      ? Number(raw.cliffTime)
      : null;
    const total     = BigInt(raw.depositAmount);
    const withdrawn = BigInt(raw.withdrawnAmount);

    // Both Tranched and Dynamic vest in a non-linear shape we represent as
    // discrete unlockSteps (Tranched = explicit tranches; Dynamic = its curve
    // sampled via sampleDynamicSegments). Both then use computeStepVesting +
    // the "steps" chart, so claimable math and the rendered curve agree.
    // LockupLinear (and anything else) stays on the straight-line path.
    const isTranched = raw.category === "LockupTranched" && Array.isArray(raw.tranches) && raw.tranches.length > 0;
    const isDynamic  = raw.category === "LockupDynamic"  && Array.isArray(raw.segments) && raw.segments.length > 0;
    const unlockSteps = isTranched
      ? raw.tranches!
          .map((t) => ({ timestamp: Number(t.endTime), amount: t.amount }))
          .sort((a, b) => a.timestamp - b.timestamp)
      : isDynamic
        ? sampleDynamicSegments(raw.segments!)
        : undefined;
    const isStepStream = (isTranched || isDynamic) && !!unlockSteps && unlockSteps.length > 0;

    let claimableNow: bigint, lockedAmount: bigint, isFullyVested: boolean;
    if (isStepStream && unlockSteps) {
      ({ claimableNow, lockedAmount, isFullyVested } = computeStepVesting(total, withdrawn, unlockSteps, nowSec));
    } else {
      ({ claimableNow, lockedAmount, isFullyVested } = computeLinearVesting(total, withdrawn, startTime, endTime, nowSec, cliffTime));
    }

    return {
      id:              `sablier-${chainId}-${raw.subgraphId}`,
      protocol:        "sablier",
      // Sablier Lockup (Linear/Tranched/Dynamic) — investor vesting. The
      // separate Sablier Flow product is "stream" but lives in a different
      // adapter (planned).
      category:        "vesting",
      chainId,
      recipient:       raw.recipient,
      tokenAddress:    raw.asset.address,
      // 2026-05-20: read from the resolver's metaById map rather than the
      // raw subgraph fields. Resolver handles the empty-symbol /
      // bytes32-symbol cascade so we never store literal "UNKNOWN" or
      // null for a token that exists on chain.
      tokenSymbol:     metaById.get(raw.subgraphId)?.symbol   ?? raw.asset.symbol,
      tokenDecimals:   metaById.get(raw.subgraphId)?.decimals ?? Number(raw.asset.decimals),
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
      lockTxHash:      raw.creationActions?.[0]?.hash ?? null,
    };
  });
}

export const sablierAdapter: VestingAdapter = {
  id:   "sablier",
  name: "Sablier",
  supportedChainIds: SUPPORTED_CHAINS,
  fetch: fetchForChain,
};
