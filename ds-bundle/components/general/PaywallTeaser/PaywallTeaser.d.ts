import * as React from 'react';

/**
 * PaywallTeaser — from vestr@0.1.0.
 */
export interface PaywallTeaserProps {
  /** The hidden rows. Rendered blurred + non-interactive. */
  children: React.ReactNode;
  /** "32 more upcoming unlocks", "all 47 events", etc. */
  hiddenLabel: string;
  /** Where the CTA button points. Defaults to the free-signup funnel entry (/find-vestings) – see the file-level note for why */
  ctaHref?: string;
  /** Caller can override the headline. Defaults to a generic "see all" copy. */
  headline?: string;
  /** Caller can override the sub-line under the headline. */
  subline?: string;
  /** CTA button text. Defaults to "Sign up free to see all →". */
  ctaLabel?: string;
}

export declare const PaywallTeaser: React.ComponentType<PaywallTeaserProps>;
