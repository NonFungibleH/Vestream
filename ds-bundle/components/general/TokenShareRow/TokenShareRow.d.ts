import * as React from 'react';

/**
 * TokenShareRow — from vestr@0.1.0.
 */
export interface TokenShareRowProps {
/** Full page URL – e.g. https://www.vestream.io/token/1/0x... */
  pageUrl: string;
  /** Token symbol, used in the tweet text. */
  symbol: string;
  /** Chain name, used in tweet text. */
  chainName: string;
  /** Optional short summary of locked TVL for the tweet, e.g. "$2.8M". */
  lockedSummary?: string | null;
}

export declare const TokenShareRow: React.ComponentType<TokenShareRowProps>;
