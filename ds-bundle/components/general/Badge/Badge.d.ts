import * as React from 'react';

/**
 * Badge — from vestr@0.1.0.
 */
export interface BadgeProps {
variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  /** Render as the child element instead of a <span> (Radix Slot). */
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export declare const Badge: React.ComponentType<BadgeProps>;
