interface Props {
    walletAddress?: string;
    /** Optional token symbol context (e.g. "NOVA"). Mobile pre-fills add-wallet. */
    tokenSymbol?: string;
    /** Coarse surface tag for analytics – "find_vestings", "explore", etc. */
    surface: string;
    className?: string;
    /** Inline style passthrough so callers can match local theming without a CSS file. */
    style?: React.CSSProperties;
    children?: React.ReactNode;
}
export declare function TrackInAppCTA({ walletAddress, tokenSymbol, surface, className, style, children }: Props): import("react/jsx-runtime").JSX.Element;
export {};
