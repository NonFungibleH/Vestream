import * as React from 'react';

/**
 * Separator — from vestr@0.1.0.
 */
export interface SeparatorProps {
orientation?: "horizontal" | "vertical";
  /** Purely visual — hidden from assistive tech (default true). */
  decorative?: boolean;
  className?: string;
}

export declare const Separator: React.ComponentType<SeparatorProps>;
