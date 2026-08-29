interface DashboardSidebarProps {
    /** Kept for back-compat with callers that still pass it. The sidebar
     *  no longer branches on tier – the dashboard is Pro-only via
     *  middleware so this prop is unused inside. Safe to drop from
     *  callers in a future cleanup. */
    tier?: string;
    isOpen: boolean;
    onClose: () => void;
}
export declare function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps): import("react/jsx-runtime").JSX.Element;
export {};
