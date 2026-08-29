import type { TokenOverview, UnlockCalendarBucket, TokenMarketData, TokenUpcomingEvent, TokenRecipient } from "./token-aggregates";
export interface FAQItem {
    question: string;
    /** Plain-text answer. Safe for both DOM rendering and JSON-LD. */
    answer: string;
}
export interface BuildFAQInput {
    chainId: number;
    tokenAddress: string;
    /** Preferred display symbol. Callers should pass `overview?.tokenSymbol ??
     *  market.tokenName ?? "the token"`. Used inline in every answer. */
    symbol: string;
    /** May be null for tokens with no indexed vesting yet – the builder
     *  produces graceful "nothing indexed" variants in that case. */
    overview: TokenOverview | null;
    market: TokenMarketData;
    calendar: UnlockCalendarBucket[];
    upcoming: TokenUpcomingEvent[];
    recipients: TokenRecipient[];
}
export declare function buildTokenFAQ(input: BuildFAQInput): FAQItem[];
