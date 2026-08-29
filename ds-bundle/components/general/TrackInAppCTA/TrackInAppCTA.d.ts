import * as React from 'react';

/**
 * TrackInAppCTA — from vestr@0.1.0.
 */
export interface TrackInAppCTAProps {
walletAddress?: string;
  /** Optional token symbol context (e.g. "NOVA"). Mobile pre-fills add-wallet. */
  tokenSymbol?: string;
  /** Coarse surface tag for analytics – "find_vestings", "explore", etc. */
  surface: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export declare const TrackInAppCTA: React.ComponentType<TrackInAppCTAProps>;
