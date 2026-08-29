import type { PulseOutput } from "@/lib/vesting/token-pulse";
interface Props {
    pulse: PulseOutput;
    /** For the card header and fallback wording. */
    symbol: string;
    /** "light" (default) matches the white public /token page. "dark" swaps to
     *  the dashboard's `--preview-*` themed surfaces so the same card reads
     *  correctly on the dark Vesting Explorer. */
    variant?: "light" | "dark";
}
export declare function TokenPulse({ pulse, symbol, variant }: Props): import("react/jsx-runtime").JSX.Element | null;
export {};
