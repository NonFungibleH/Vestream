import * as React from 'react';

/**
 * TokenPulse — from vestr@0.1.0.
 */
export interface TokenPulseProps {
pulse: PulseOutput;
  /** For the card header and fallback wording. */
  symbol: string;
  /** "light" (default) matches the white public /token page. "dark" swaps to the dashboard's `--preview-*` themed surfaces. */
  variant?: "light" | "dark";
}

export declare const TokenPulse: React.ComponentType<TokenPulseProps>;
