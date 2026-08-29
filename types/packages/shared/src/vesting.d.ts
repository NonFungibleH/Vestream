export declare const CHAIN_IDS: {
    readonly ETHEREUM: 1;
    readonly BSC: 56;
    readonly POLYGON: 137;
    readonly BASE: 8453;
    readonly ARBITRUM: 42161;
    readonly OPTIMISM: 10;
    readonly AVALANCHE: 43114;
    readonly SEPOLIA: 11155111;
    readonly BASE_SEPOLIA: 84532;
    readonly SOLANA: 101;
};
export type SupportedChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];
export declare const CHAIN_NAMES: Record<SupportedChainId, string>;
export declare const TESTNET_CHAIN_IDS: SupportedChainId[];
export declare const NON_EVM_CHAIN_IDS: SupportedChainId[];
export declare const EVM_CHAIN_IDS: SupportedChainId[];
/** True when the given chainId belongs to an EVM-compatible network. */
export declare function isEvmChain(id: SupportedChainId): boolean;
export declare const ALL_CHAIN_IDS: SupportedChainId[];
/**
 * The canonical output from every protocol adapter. Every field is
 * JSON-safe (bigints are stringified) so these objects round-trip cleanly
 * through fetch, SSR, localStorage, React Native AsyncStorage, etc.
 */
/**
 * Category of a token-receipt stream. Drives UI branching, copy choices,
 * and tax-export labelling. Set explicitly by every adapter.
 *
 *   - "vesting"   = discrete or linear cliff/unlock vesting (Sablier Lockup,
 *                   Hedgey, UNCX, Unvest, Team Finance, PinkSale, Streamflow,
 *                   Jupiter Lock — investor TGE / team grants / token locks).
 *   - "stream"    = continuous per-second token streaming (LlamaPay,
 *                   Superfluid Money Streams, Sablier Flow — payroll / DAO
 *                   contributor pay / grant streams).
 *   - "milestone" = milestone-/event-triggered releases that aren't on a
 *                   time schedule (reserved for future protocols; nothing
 *                   uses this today).
 *
 * The category is a property of the protocol + product, not the receiver —
 * the same stream looks identical to investor and worker users; the
 * difference is in HOW we frame it (next-unlock-countdown vs streaming-rate)
 * and how the receiver's tax export classifies the income.
 */
export type StreamCategory = "vesting" | "stream" | "milestone";
/**
 * Default category lookup keyed by adapter ID. Adapters should set
 * `category` explicitly on each stream — this map exists so:
 *   1. Cache rows from before the field existed can be back-filled at
 *      read time (defaults derived from `protocol`).
 *   2. Cross-cutting code (e.g. /protocols category filter, /status page)
 *      can group protocols without touching every adapter.
 *
 * If a protocol ever produces multiple categories (e.g. a future Sablier
 * adapter that handles both Lockup AND Flow), the adapter sets each
 * stream's category individually and this map gives a sensible fallback.
 */
export declare const PROTOCOL_DEFAULT_CATEGORY: Record<string, StreamCategory>;
/** Lookup helper — falls back to "vesting" for unknown adapter ids so the
 *  UI never crashes on a freshly-added protocol that the shared package
 *  hasn't been bumped to know about yet. */
export declare function categoryForProtocol(protocol: string): StreamCategory;
export interface VestingStream {
    /** Composite ID: `{protocol}-{chainId}-{nativeId}`. Used as stable cache key. */
    id: string;
    /** Adapter ID: "sablier" | "hedgey" | "team-finance" | "uncx" | "unvest" | ... */
    protocol: string;
    /** Vesting vs stream vs milestone. See StreamCategory docstring. Required —
     *  every adapter must set this explicitly so the UI/tax/export layers can
     *  branch off it without runtime surprises. Cache rows from before this
     *  field existed are back-filled via categoryForProtocol() on read. */
    category: StreamCategory;
    chainId: SupportedChainId;
    recipient: string;
    tokenAddress: string;
    tokenSymbol: string;
    tokenDecimals: number;
    /** Stringified bigint. All downstream math should BigInt() these.
     *
     *  Semantics differ by category:
     *    - vesting/milestone: total scheduled allocation (fixed at creation).
     *    - stream: streamed-so-far snapshot at fetch time. Advances on each
     *      refresh as more time elapses; there is no fixed "scheduled total"
     *      because the payer can keep topping up the deposit indefinitely. */
    totalAmount: string;
    withdrawnAmount: string;
    claimableNow: string;
    /** Always 0 for "stream" category — continuous streams have no future
     *  locked allocation in the vesting sense. */
    lockedAmount: string;
    /** Unix seconds. */
    startTime: number;
    /** For "stream" category, this is the snapshot time (nowSec at fetch),
     *  not a scheduled end. Use category to decide how to render. */
    endTime: number;
    cliffTime: number | null;
    isFullyVested: boolean;
    /** Null for "stream" category — continuous streams have no discrete
     *  next-unlock event; receivers can claim accrued balance any time. */
    nextUnlockTime: number | null;
    /** undefined = not reported by adapter (e.g. hedgey, uncx). */
    cancelable?: boolean;
    /** Step/tranche vesting (e.g. Sablier LockupTranched). */
    shape?: "linear" | "steps";
    unlockSteps?: {
        timestamp: number;
        amount: string;
    }[];
    /** Individual withdrawal/claim events — populated when the adapter can fetch them. */
    claimEvents?: {
        timestamp: number;
        amount: string;
    }[];
    /** Originating on-chain transaction hash (the tx that minted/created
     *  this vesting). EVM: 0x-prefixed 32-byte hash. Solana: base58
     *  signature (different shape but same semantic role). Null when the
     *  adapter can't surface it cheaply — PinkSale relies on contract
     *  enumeration with no per-stream tx context, and Solana program
     *  accounts don't include the originating signature in their data.
     *  Tap-to-open routes through the chain's block explorer. Added
     *  2026-05-14 for the retail-transparency push: a verifiable on-chain
     *  link from each vesting back to its creation event. */
    lockTxHash?: string | null;
    /** In-app claiming (2026-06, Phase 1: Sablier + Hedgey).
     *  claimContract — the on-chain contract holding the claim function
     *  (Sablier: per-stream Lockup contract from Envio's `contract` field;
     *  Hedgey: the TokenVestingPlans deployment for the chain).
     *  claimNativeId — the on-chain id the claim function takes. NOT always
     *  the stream id's third segment: Sablier ids embed Envio's `subgraphId`
     *  (a global counter), while withdrawMax() needs the per-contract
     *  `tokenId`. Hedgey's planId is the same in both places.
     *  Both undefined ⇒ in-app claiming unsupported for this stream (mobile
     *  falls back to the protocol's web claim UI). */
    claimContract?: string | null;
    claimNativeId?: string | null;
    /** Extra named claim arguments for protocols whose claim call takes more
     *  than a single id (added 2026-06, universal-claiming Phase 0). Example:
     *  LlamaPay's `withdraw(from, to, amountPerSec)` needs `{ from, amountPerSec }`
     *  (the recipient = `to` comes from `recipient`). A recipe reads EITHER
     *  `claimNativeId` (single-id protocols) OR `claimArgs` (multi-arg). Values
     *  are stringified so the payload stays JSON-safe through the cache + API. */
    claimArgs?: Record<string, string> | null;
}
export declare function computeLinearVesting(total: bigint, withdrawn: bigint, startTime: number, endTime: number, nowSec: number, cliffTime?: number | null): {
    claimableNow: bigint;
    lockedAmount: bigint;
    isFullyVested: boolean;
};
export declare function nextUnlockTime(isFullyVested: boolean, nowSec: number, cliffTime: number | null, endTime: number): number | null;
export declare function computeStepVesting(total: bigint, withdrawn: bigint, unlockSteps: {
    timestamp: number;
    amount: string;
}[], nowSec: number): {
    claimableNow: bigint;
    lockedAmount: bigint;
    isFullyVested: boolean;
};
export declare function nextUnlockTimeForSteps(nowSec: number, unlockSteps: {
    timestamp: number;
    amount: string;
}[]): number | null;
