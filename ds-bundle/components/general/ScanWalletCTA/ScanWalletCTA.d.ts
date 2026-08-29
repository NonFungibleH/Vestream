import * as React from 'react';

/**
 * ScanWalletCTA — from vestr@0.1.0.
 */
export interface ScanWalletCTAProps {
heading?: string;
  sub?: string;
  /** Where this CTA is placed — for analytics attribution. */
  surface?: string;
}

export declare const ScanWalletCTA: React.ComponentType<ScanWalletCTAProps>;
