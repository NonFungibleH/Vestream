import type { TokenOverview, UnlockCalendarBucket, TokenMarketData, TokenUpcomingEvent, TokenRecipient } from "./token-aggregates";
export interface PulseOutput {
    /** 3-4 short sentences, each a standalone insight. Shown as bullets
     *  above the fold. Empty array means "nothing substantive to say" —
     *  caller should hide the pulse section entirely. */
    bullets: string[];
    /** Longer flowing paragraph shown behind "See more". Always populated
     *  if `bullets` is non-empty — the extended view is supposed to make
     *  the bullets read like a coherent narrative. */
    extended: string;
    /** When the summary was generated. Surfaces as "Updated X ago" in the
     *  UI so visitors know how fresh the data is. */
    generatedAt: Date;
}
export interface BuildPulseInput {
    symbol: string;
    overview: TokenOverview | null;
    market: TokenMarketData;
    calendar: UnlockCalendarBucket[];
    upcoming: TokenUpcomingEvent[];
    recipients: TokenRecipient[];
}
/**
 * Build the Pulse output from token data. Returns empty bullets + empty
 * extended string when there's genuinely nothing to say — callers should
 * check `bullets.length > 0` before rendering.
 */
export declare function buildTokenPulse(input: BuildPulseInput): PulseOutput;
