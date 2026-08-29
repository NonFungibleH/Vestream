import * as React from 'react';

/**
 * PricingCta — from vestr@0.1.0.
 */
export interface PricingCtaProps {
  /** Button label */
  label: string;
  /** Destination – defaults to the early-access page */
  href?: string;
  /** Tailwind + inline style classNames forwarded to the rendered <a> */
  className?: string;
  style?: CSSProperties;
}

export declare const PricingCta: React.ComponentType<PricingCtaProps>;
