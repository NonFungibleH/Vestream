import * as React from 'react';

/**
 * CopyButton — from vestr@0.1.0.
 */
export interface CopyButtonProps {
/** The full string to copy to clipboard (e.g. the full contract address). */
  value: string;
  /** What to display instead of `value` (e.g. a truncated address). */
  display: string;
  className?: string;
  style?: React.CSSProperties;
}

export declare const CopyButton: React.ComponentType<CopyButtonProps>;
