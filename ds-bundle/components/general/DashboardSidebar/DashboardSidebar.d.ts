import * as React from 'react';

/**
 * DashboardSidebar — from vestr@0.1.0.
 */
export interface DashboardSidebarProps {
  /** Kept for back-compat with callers that still pass it. The sidebar no longer branches on tier – the dashboard is Pro-only */
  tier?: string;
  isOpen: boolean;
  onClose: () => void;
}

export declare const DashboardSidebar: React.ComponentType<DashboardSidebarProps>;
