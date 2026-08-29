import * as React from 'react';

/**
 * SiteNav — from vestr@0.1.0.
 */
export interface SiteNavProps {
/**
   * "light" = white/grey consumer pages (default) – homepage, pricing, resources
   * "navy"  = dark navy developer page – /developer
   * "dark"  = near-black AI/technical pages – /ai
   */
  theme?: "light" | "navy" | "dark";
}

export declare const SiteNav: React.ComponentType<SiteNavProps>;
