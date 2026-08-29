import * as React from 'react';

/**
 * TokenMetaPanel — from vestr@0.1.0.
 */
export interface TokenMetaPanelProps {
chainId: number;
  tokenAddress: string;
  /** Required – used for the X search query + labels. May be null for tokens with no resolved symbol. */
  tokenSymbol: string | null;
  market: TokenMarketData;
  overview: TokenOverview;
}

export declare const TokenMetaPanel: React.ComponentType<TokenMetaPanelProps>;
