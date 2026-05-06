// src/lib/vesting/adapters/sablier-flow.ts
// ─────────────────────────────────────────────────────────────────────────────
// Sablier Flow — per-second token streaming. Sister to (but distinct from)
// Sablier Lockup, which is in adapters/sablier.ts and handles cliff/unlock
// vesting. Flow is the worker-pivot's flagship EVM payroll protocol after
// LlamaPay — same category ("stream") but a wider chain footprint and
// different schema.
//
// Schema mapping note (continuous stream → VestingStream shape):
//
//   Like LlamaPay, Flow streams have no fixed totalAmount or endTime. We
//   map them as a "fully-vested-up-to-now snapshot":
//
//     totalAmount     = streamed-so-far at fetch time
//     withdrawnAmount = withdrawnAmount from subgraph
//     claimableNow    = streamed − withdrawn (clamped >= 0)
//     lockedAmount    = 0n
//     startTime       = createdTimestamp
//     endTime         = nowSec
//     isFullyVested   = true
//     nextUnlockTime  = null (continuous; claim anytime)
//
// Decimals gotcha (different from LlamaPay):
//   - ratePerSecond is ALWAYS 18-decimal scaled (Flow uses an internal
//     18-decimal accounting layer to handle sub-wei rates for low-decimal
//     tokens like USDC).
//   - depositedAmount, withdrawnAmount, snapshotAmount are in TOKEN-NATIVE
//     decimals.
//   - Streamed-to-date math:
//       streamed = snapshotAmount
//                + (now − lastAdjustmentTimestamp) × ratePerSecond
//                  ÷ 10^(18 − tokenDecimals)
//
// Indexing: same Envio HyperIndex endpoint as Lockup, different entity
// (FlowStream vs LockupStream). Single multi-chain endpoint, chainId
// filtered in-query. See src/lib/vesting/adapters/sablier.ts for the
// migration history that landed both adapters on Envio.
//
// Pause/void semantics: entities persist when paused or voided (Flow
// uses "voided" instead of Lockup's "canceled"); flags flip in place.
// Filter to `paused: false, voided: false` to surface only flowing
// streams in the user's portfolio.
// ─────────────────────────────────────────────────────────────────────────────

import { VestingAdapter } from "./index";
import {
  VestingStream, SupportedChainId, CHAIN_IDS,
} from "../types";

const SABLIER_ENVIO_URL =
  process.env.SABLIER_ENVIO_URL ?? "https://indexer.hyperindex.xyz/53b7e25/v1/graphql";

// Flow is deployed on a SUPERSET of Lockup's chains (24 chains as of May
// 2026). We index the subset we already support elsewhere — adding more
// later is a one-line per-chain change.
const SUPPORTED_CHAINS: SupportedChainId[] = [
  CHAIN_IDS.ETHEREUM,
  CHAIN_IDS.BSC,
  CHAIN_IDS.POLYGON,
  CHAIN_IDS.BASE,
  CHAIN_IDS.ARBITRUM,
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.SEPOLIA,
];

const STREAMS_QUERY = /* GraphQL */ `
  query SablierFlowStreams($recipients: [String!]!, $chainId: numeric!) {
    FlowStream(
      where: {
        chainId:   { _eq: $chainId }
        recipient: { _in: $recipients }
        paused:    { _eq: false }
        voided:    { _eq: false }
      }
      order_by: { startTime: asc }
      limit: 200
    ) {
      id
      chainId
      sender
      recipient
      asset { id symbol decimals }
      assetDecimalsValue
      ratePerSecond
      depositedAmount
      withdrawnAmount
      snapshotAmount
      startTime
      lastAdjustmentTimestamp
      paused
      voided
    }
  }
`;

interface RawFlowStream {
  id:                       string;
  chainId:                  string;
  sender:                   string;
  recipient:                string;
  asset:                    { id: string; symbol: string; decimals: string } | null;
  assetDecimalsValue:       string;
  ratePerSecond:            string;
  depositedAmount:          string;
  withdrawnAmount:          string;
  snapshotAmount:           string;
  startTime:                string;
  lastAdjustmentTimestamp:  string;
  paused:                   boolean;
  voided:                   boolean;
}

async function fetchForChain(
  wallets: string[],
  chainId: SupportedChainId,
): Promise<VestingStream[]> {
  if (!SUPPORTED_CHAINS.includes(chainId)) return [];
  if (wallets.length === 0) return [];

  const lowercased = wallets.map((a) => a.toLowerCase());

  let json: { data?: { FlowStream?: RawFlowStream[] }; errors?: unknown };
  try {
    const res = await fetch(SABLIER_ENVIO_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept":       "application/json",
        "User-Agent":   "Mozilla/5.0 (compatible; TokenVest/1.0; +https://vestream.io)",
      },
      body: JSON.stringify({
        query:     STREAMS_QUERY,
        variables: { recipients: lowercased, chainId },
      }),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      console.error(`[sablier-flow/${chainId}] HTTP ${res.status}`);
      return [];
    }
    json = await res.json();
  } catch (err) {
    console.error(`[sablier-flow/${chainId}] fetch error:`, err);
    return [];
  }

  if (json.errors) {
    console.error(
      `[sablier-flow/${chainId}] subgraph errors:`,
      JSON.stringify(json.errors).slice(0, 300),
    );
    return [];
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const raw    = json.data?.FlowStream ?? [];

  return raw.map((s): VestingStream => {
    // Token-native decimals — assetDecimalsValue is mirrored on the stream
    // for callers that don't load the nested asset object. Falls back to
    // asset.decimals if for some reason the mirror is null/missing.
    const decimals = Number(s.assetDecimalsValue ?? s.asset?.decimals ?? 18);
    const startTime              = Number(s.startTime);
    const lastAdjustmentTime     = Number(s.lastAdjustmentTimestamp);
    const elapsedSinceAdjustment = Math.max(0, nowSec - lastAdjustmentTime);

    // ratePerSecond is 18-dec scaled regardless of token decimals.
    // Streamed-since-snapshot in token-native = elapsed × rate ÷ 10^(18 − decimals).
    // We only handle decimals ≤ 18 here (the realistic range for ERC-20s);
    // the divisor would underflow for decimals > 18 but that's not in the wild.
    const rate18      = BigInt(s.ratePerSecond);
    const divisor     = 10n ** BigInt(Math.max(0, 18 - decimals));
    const elapsedRate = rate18 * BigInt(elapsedSinceAdjustment);
    const streamedSinceSnapshot = elapsedRate / divisor;

    const snapshot   = BigInt(s.snapshotAmount);
    const streamed   = snapshot + streamedSinceSnapshot;
    const withdrawn  = BigInt(s.withdrawnAmount);
    const claimable  = streamed > withdrawn ? streamed - withdrawn : 0n;

    return {
      // stream.id is already chainId-bearing ("{contract}-{chainId}-{tokenId}"),
      // so wrapping it in our protocol prefix gives a stable, collision-proof
      // composite id without us having to invent the segmentation ourselves.
      id:              `sablier-flow-${s.id}`,
      protocol:        "sablier-flow",
      category:        "stream",
      chainId,
      recipient:       s.recipient.toLowerCase(),
      tokenAddress:    s.asset?.id ?? "",
      tokenSymbol:     s.asset?.symbol ?? "???",
      tokenDecimals:   decimals,
      totalAmount:     streamed.toString(),
      withdrawnAmount: withdrawn.toString(),
      claimableNow:    claimable.toString(),
      lockedAmount:    "0",
      startTime,
      endTime:         nowSec,
      cliffTime:       null,
      isFullyVested:   true,
      nextUnlockTime:  null,
      cancelable:      true,
      shape:           "linear",
    };
  });
}

export const sablierFlowAdapter: VestingAdapter = {
  id:                "sablier-flow",
  name:              "Sablier Flow",
  supportedChainIds: SUPPORTED_CHAINS,
  fetch:             fetchForChain,
};
