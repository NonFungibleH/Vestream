interface Props {
    /** The full string to copy to clipboard (e.g. the full contract address). */
    value: string;
    /** What to display instead of `value` (e.g. a truncated address). */
    display: string;
    className?: string;
    style?: React.CSSProperties;
}
export declare function CopyButton({ value, display, className, style }: Props): import("react/jsx-runtime").JSX.Element;
export {};
