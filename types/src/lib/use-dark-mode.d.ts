import { type ReactNode } from "react";
interface DarkModeValue {
    dark: boolean;
    toggle: () => void;
}
export declare function DarkModeProvider({ children, initialDark, }: {
    children: ReactNode;
    initialDark: boolean;
}): import("react/jsx-runtime").JSX.Element;
/**
 * Read the dashboard night-mode value. Returns `{ dark, toggle }`. Safe
 * outside the provider (returns a sensible default + no-op toggle) so a
 * stray usage can't crash a page.
 */
export declare function useDarkMode(): DarkModeValue;
export {};
