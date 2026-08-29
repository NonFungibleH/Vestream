interface Props {
    /** Full page URL – e.g. https://www.vestream.io/token/1/0x... */
    pageUrl: string;
    /** Token symbol, used in the tweet text. */
    symbol: string;
    /** Chain name, used in tweet text. */
    chainName: string;
    /** Optional short summary of locked TVL for the tweet, e.g. "$2.8M". */
    lockedSummary?: string | null;
}
export declare function TokenShareRow({ pageUrl, symbol, chainName, lockedSummary }: Props): import("react/jsx-runtime").JSX.Element;
export {};
