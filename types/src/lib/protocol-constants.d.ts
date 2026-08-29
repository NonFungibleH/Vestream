import { type SupportedChainId } from "./vesting/types";
export interface Testimonial {
    quote: string;
    author: string;
    role?: string;
}
export interface ProtocolMeta {
    /** URL segment: `/protocols/{slug}`. Also matches VestingStream.protocol. */
    slug: string;
    /** Adapter IDs this page aggregates from (usually [slug], but see uncx). */
    adapterIds: string[];
    /** Display name, used in <h1> and nav labels. */
    name: string;
    /** One-liner shown in the hero under the <h1>. */
    tagline: string;
    /** 2–3 sentence descriptive paragraph for the hero + meta description. */
    description: string;
    /** Accent hex – used on badges, logo tile, highlights. */
    color: string;
    /** Translucent background tint (rgba). */
    bg: string;
    /** Translucent border (rgba). */
    border: string;
    /** Mainnet chain IDs this protocol is indexed on. */
    chainIds: SupportedChainId[];
    /** Canonical public site. */
    officialUrl: string;
    /** Where users go to claim on the real protocol UI. */
    claimUrl: string;
    /** SEO keyword phrases this page targets. */
    searchKeywords: string[];
    /** 3 use-case cards specific to this protocol. */
    useCases: {
        title: string;
        body: string;
    }[];
    /** 3 related protocol slugs for cross-linking (improves internal SEO). */
    relatedSlugs: string[];
    /** Testimonials – empty array renders a "collecting" call-out instead. */
    testimonials: Testimonial[];
    /**
     * Optional: use an external TVL source instead of computing from the
     * local cache. Set for protocols where we don't run our own seeder (e.g.
     * Streamflow → DefiLlama). When set, the /protocols card displays this
     * source's number with an attribution tag.
     *
     * `slug` accepts either a single DefiLlama slug or an array – the array
     * form is summed at fetch time. Used when DefiLlama splits a protocol
     * across multiple entries (e.g. UNCX was one entry `uncx-network`, became
     * `uncx-network-v2` + `uncx-network-v3` – sum them for the combined TVL).
     */
    externalTvl?: {
        source: "defillama";
        slug: string | readonly string[];
        category?: string;
    };
    /**
     * If true, the protocol is hidden from public surfaces (UI cards, /protocols
     * index, search) AND skipped by the seeder + TVL snapshot cron – no
     * outbound API/RPC calls are made on its behalf. Existing cache rows are
     * left in place so re-enabling is one line + a deep-seed.
     *
     * Use sparingly – this exists for "temporarily pause an integration"
     * scenarios (e.g. upstream API outage, rebrand, legal review). Permanent
     * removal should delete the entry entirely instead.
     */
    disabled?: boolean;
    /**
     * Primary product category – drives the /protocols category-split UI
     * and the homepage messaging. "vesting" = cliff/unlock investor or
     * team-grant tokens; "stream" = continuous per-second payments
     * (payroll, contributor pay). Defaults to "vesting" when omitted so
     * existing entries don't need updating.
     *
     * If a protocol legitimately serves both (e.g. Sablier's Lockup product
     * + their separate Flow product), the secondary category will be added
     * via a future "categories" array. For now: pick the dominant one.
     */
    category?: "vesting" | "stream";
}
export declare const PROTOCOLS: Record<string, ProtocolMeta>;
/** Publicly-listed protocols in nav/footer/sitemap order. */
export declare const PROTOCOL_SLUGS: readonly ["sablier", "hedgey", "superfluid", "uncx", "team-finance", "unvest", "pinksale", "streamflow", "jupiter-lock", "llamapay"];
export type ProtocolSlug = typeof PROTOCOL_SLUGS[number];
/** Safe lookup helper – returns undefined for unknown slugs. */
export declare function getProtocol(slug: string): ProtocolMeta | undefined;
export interface ProtocolBrand {
    color: string;
    bg: string;
    border: string;
    name: string;
}
export declare const PROTOCOL_BRAND: Record<string, ProtocolBrand>;
/** Brand colours for a protocol slug. Falls back to a neutral slate (with the
 *  raw slug as name) for unknown protocols so callers never crash. */
export declare function protocolBrand(slug: string): ProtocolBrand;
export interface ProtocolChip {
    text: string;
    bg: string;
    border: string;
}
export declare function protocolChip(slug: string): ProtocolChip;
/** Prebuilt chip map for every known slug (incl. the `uncx-vm` alias). Callers
 *  still `?? fallback` for unknowns, so missing keys are safe. */
export declare const PROTOCOL_CHIPS: Record<string, ProtocolChip>;
/** Path to a protocol's logo icon, or null when there's no mark (→ monogram). */
export declare function protocolIcon(slug: string): string | null;
export interface ChainBrand {
    color: string;
    bg: string;
    border: string;
    name: string;
}
/** Brand colours for a chain id. `bg`/`border` are 8%/20% alpha tints of the
 *  brand colour. Falls back to neutral slate for unknown chains. */
export declare function chainBrand(chainId: number): ChainBrand;
/** Path to a chain's logo icon, or null for unknown / testnet chains. */
export declare function chainIcon(chainId: number): string | null;
/**
 * All protocols in display order.
 *
 * By default, protocols flagged `disabled: true` are filtered out – this is
 * what every public surface (UI cards, /protocols index, search, sitemap)
 * should call. Pass `{ includeDisabled: true }` for admin / diagnostic
 * surfaces that need the full registry (e.g. an internal "all protocols
 * including paused" view).
 */
export declare function listProtocols(opts?: {
    includeDisabled?: boolean;
}): ProtocolMeta[];
/**
 * Adapter-id-level enabled check. Used by the seeder + TVL snapshot cron to
 * skip outbound calls for paused protocols. Note this checks the PROTOCOL
 * meta (keyed by slug) – the merged `uncx` entry covers both `uncx` and
 * `uncx-vm` adapter IDs, so we look up by reverse-mapping adapterIds → slug.
 */
export declare function isAdapterEnabled(adapterId: string): boolean;
/**
 * PinkLock V2 deployments. The V2 contract on each chain has the
 * `allNormalTokenLockedCount()` + `getCumulativeLockInfo()` ABI we use.
 *
 * NOT the V1 contracts – V1 (e.g. ETH 0x33d4cc...5e2a, BSC 0x7ee058...) is
 * basically abandoned. Verified May 1 2026 by direct
 * `allNormalTokenLockedCount()` calls:
 *   - ETH V2 (this map):  2,184 tokens locked
 *   - ETH V1 (NOT this):     30 tokens (dead)
 *   - BSC V2 (this map): 22,622 tokens
 *   - BSC V1 (NOT this):  4,668 tokens
 */
export declare const PINKSALE_CONTRACT_ADDRESSES: Partial<Record<SupportedChainId, `0x${string}`>>;
