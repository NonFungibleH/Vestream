import * as React from 'react';

/**
 * SiteFooter — from vestr@0.1.0.
 */
export interface SiteFooterProps {
/** Colour theme – matches the page background. */
  theme?: "light" | "navy" | "dark";
  /** Optional extra copy line (e.g. "Results may take 10s"). */
  note?: string;
  /** Render the background as a recessed panel (useful on developer/AI). */
  recessed?: boolean;
}

export declare const SiteFooter: React.ComponentType<SiteFooterProps>;
