interface Props {
    /**
     * "light"  = white/grey consumer pages (default) – homepage, pricing, resources
     * "navy"   = dark navy developer page – /developer
     * "dark"   = near-black AI/technical pages – /ai
     */
    theme?: "light" | "navy" | "dark";
}
export declare function SiteNav({ theme }: Props): import("react/jsx-runtime").JSX.Element;
export {};
