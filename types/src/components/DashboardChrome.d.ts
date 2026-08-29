import { type ReactNode } from "react";
interface ChromeContextValue {
    sidebarOpen: boolean;
    setSidebarOpen: (next: boolean) => void;
    toggleSidebar: () => void;
}
/**
 * Use inside any /dashboard/* page to control the mobile sidebar drawer.
 * Page headers typically render a hamburger button below md that calls
 * `toggleSidebar()`. Returns a no-op context outside the chrome (e.g.
 * if a dashboard component is reused on a non-dashboard page).
 */
export declare function useDashboardChrome(): ChromeContextValue;
interface DashboardChromeProps {
    children: ReactNode;
    /** User's tier – passed through from layout server-side fetch. */
    tier?: string;
}
export declare function DashboardChrome({ children, tier }: DashboardChromeProps): import("react/jsx-runtime").JSX.Element;
export {};
