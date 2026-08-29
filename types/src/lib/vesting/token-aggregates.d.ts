import type { VestingStream } from "./types";
export interface TokenOverview {
    chainId: number;
    tokenAddress: string;
    tokenSymbol: string | null;
    tokenDecimals: number;
    streamCount: number;
    activeStreamCount: number;
    recipientCount: number;
    lockedTokensWhole: number;
    protocolMix: Array<{
        protocol: string;
        streams: number;
        lockedTokensWhole: number;
    }>;
    upcoming7dTokens: number;
    upcoming30dTokens: number;
    upcoming90dTokens: number;
}
export interface UnlockCalendarBucket {
    /** Unix seconds for the first day of the bucket's month. */
    timestamp: number;
    /** "Nov 2026" — ready for display. */
    label: string;
    /** Whole tokens unlocking in this month, by protocol. */
    byProtocol: Array<{
        protocol: string;
        tokensWhole: number;
    }>;
    /** Sum of all protocols for this bucket — INCLUDES events that already
     *  fired earlier in this calendar month. The chart renders this so
     *  monthly bar heights reflect the actual schedule. */
    totalTokensWhole: number;
    /** Sum of events whose individual timestamp is in the future (>nowSec).
     *  Equal to `totalTokensWhole` for past + future-only buckets; LESS
     *  than `totalTokensWhole` for the current-month bucket when any of
     *  its tranches have already fired earlier in the month. KPIs that
     *  measure "what's still to come" (12-mo total, peak month, % of
     *  locked supply hitting market) should sum THIS, not totalTokensWhole.
     *  Added 2026-05-15 to fix the "12-MO TOTAL 393M > LOCKED 278M"
     *  presentation bug. */
    futureTokensWhole: number;
    /** True when this bucket's month is strictly before the current month.
     *  The UI uses this to render past unlocks in a muted style while keeping
     *  future unlocks in full protocol colours. */
    isPast: boolean;
}
export interface TokenRecipient {
    recipient: string;
    streamCount: number;
    lockedTokensWhole: number;
    nextUnlockTime: number | null;
    protocols: string[];
}
export interface TokenUpcomingEvent {
    streamId: string;
    protocol: string;
    recipient: string;
    timestamp: number;
    tokensWhole: number;
    /** Originating on-chain tx hash for the stream this event belongs to.
     *  Null when the adapter couldn't surface it (PinkSale, Solana
     *  adapters). Surfaced as a tap-to-explorer link next to each event.
     *  Added 2026-05-14 for the public-transparency push. */
    lockTxHash?: string | null;
    chainId?: number;
}
/**
 * Raw active streams for a token, straight from the cache — the un-aggregated
 * VestingStream[] needed to group into vesting rounds. (getTokenRecipients
 * aggregates per recipient and loses per-stream terms; this keeps them.)
 * Build-phase guard per CLAUDE.md (Supabase pooler can drop mid-build).
 */
export declare function getTokenStreams(chainId: number, tokenAddress: string): Promise<VestingStream[]>;
/**
 * Smart-money wallets that vest this token — reverse lookup over the daily
 * smart_money_snapshot. Each snapshot row carries the wallet's TOP tokens by
 * USD (topTokensJson), so this surfaces wallets where this token is among
 * their largest vesting positions — a "the smart money is in this" signal on
 * the token page. Filtered in JS (≤100 wallets × top-N tokens = trivial); no
 * jsonb query needed. Token addresses compared case-insensitively so EVM and
 * Solana mints both match without mangling stored values.
 */
export declare function getSmartMoneyHoldersOfToken(chainId: number, tokenAddress: string): Promise<Array<{
    rank: number;
    recipient: string;
    usdValue: number | null;
}>>;
export declare function getTokenOverview(chainId: number, tokenAddress: string): Promise<TokenOverview | null>;
/**
 * Monthly unlock calendar spanning `monthsBack` months of history plus
 * `monthsForward` months of upcoming unlocks. The two halves are stitched
 * into one continuous array — past buckets flagged `isPast: true`, the
 * current month onwards flagged `isPast: false`.
 *
 * Historical buckets are populated only from `shape === "steps"` tranche
 * timestamps (active streams + fully-vested streams). Linear streams are
 * skipped for history because there's no discrete "X tokens unlocked in
 * month N" for continuous flow — same reason we skip them in the
 * Upcoming Unlocks widget.
 *
 * Callers that don't care about history can pass `monthsBack: 0` to get
 * the original forward-only behaviour. The UI falls back to
 * forward-only rendering automatically when all historical buckets come
 * back empty (fresh tokens with no history to show).
 */
export declare function getTokenUnlockCalendar(chainId: number, tokenAddress: string, opts?: {
    monthsBack?: number;
    monthsForward?: number;
}): Promise<UnlockCalendarBucket[]>;
export declare function getTokenRecipients(chainId: number, tokenAddress: string, limit?: number): Promise<TokenRecipient[]>;
export declare function getTokenUpcomingEvents(chainId: number, tokenAddress: string, limit?: number): Promise<TokenUpcomingEvent[]>;
export interface TokenMarketData {
    priceUsd: number | null;
    fdv: number | null;
    marketCap: number | null;
    change24h: number | null;
    liquidity: number | null;
    volume24h: number | null;
    tokenName: string | null;
    tokenSymbol: string | null;
    imageUrl: string | null;
    website: string | null;
    /** Project's X / Twitter URL, pulled from DexScreener's info.socials[].
     *  Null when the token submission didn't include socials (common for
     *  tokens listed only by an automated pair scanner). */
    twitterUrl: string | null;
    /** Project's Telegram channel/group URL. Same DexScreener socials feed
     *  as twitterUrl; type slug is "telegram". */
    telegramUrl: string | null;
    /** Project's Discord invite/server URL. Same source; type slug "discord". */
    discordUrl: string | null;
    dexScreenerUrl: string | null;
    dexToolsUrl: string | null;
    /** DexScreener URL of the most-liquid PAIR (not the token) — embeddable as
     *  a price chart iframe. Null when no priced pair exists, which is the
     *  signal the token page uses to show/hide the chart. */
    pairUrl: string | null;
}
export declare function getTokenMarketData(chainId: number, tokenAddress: string): Promise<TokenMarketData>;
