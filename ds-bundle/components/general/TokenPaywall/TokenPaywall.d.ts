import * as React from 'react';

/**
 * TokenPaywall — from vestr@0.1.0.
 */
export interface TokenPaywallProps {
chainId: number;
  address: string;
  symbol: string;
}

export declare const TokenPaywall: React.ComponentType<TokenPaywallProps>;
