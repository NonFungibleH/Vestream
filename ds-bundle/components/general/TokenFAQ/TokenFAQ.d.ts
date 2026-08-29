import * as React from 'react';

/**
 * TokenFAQ — from vestr@0.1.0.
 */
export interface TokenFAQProps {
/** Ordered FAQ list from buildTokenFAQ(). Rendered verbatim and also serialised into the JSON-LD block. */
  items: FAQItem[];
  /** Token-specific heading so the section matches the rest of the page. */
  symbol: string;
}

export declare const TokenFAQ: React.ComponentType<TokenFAQProps>;
