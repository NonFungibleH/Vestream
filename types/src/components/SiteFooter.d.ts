interface Props {
    /** Colour theme – matches the page background. */
    theme?: "light" | "navy" | "dark";
    /** Optional extra copy line (e.g. "Results may take 10s"). */
    note?: string;
    /** Render the background as a recessed panel (useful on developer/AI). */
    recessed?: boolean;
}
export declare function SiteFooter({ theme, note, recessed }: Props): import("react/jsx-runtime").JSX.Element;
export {};
