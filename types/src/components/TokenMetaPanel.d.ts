import type { TokenMarketData, TokenOverview } from "@/lib/vesting/token-aggregates";
interface Props {
    chainId: number;
    tokenAddress: string;
    /** Required – used for the X search query + labels. May be null for tokens
     *  that don't have a resolved symbol in either DexScreener or our cache. */
    tokenSymbol: string | null;
    market: TokenMarketData;
    overview: TokenOverview;
}
export declare function TokenMetaPanel({ chainId, tokenAddress, tokenSymbol, market, overview, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
