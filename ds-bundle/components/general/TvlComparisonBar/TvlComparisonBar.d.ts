import * as React from 'react';

/**
 * TvlComparisonBar — from vestr@0.1.0.
 */
export interface TvlComparisonBarProps {
rows: TvlComparisonRow[];
  /** Protocol slugs whose TVL came from an external source (DefiLlama) rather than our own priced-cache computation. */
  externallySourced?: Set<string>;
  /** Age of the oldest snapshot row (hours) — "last verified X ago". Null when no snapshot exists yet. */
  snapshotAgeHours?: number | null;
}

export declare const TvlComparisonBar: React.ComponentType<TvlComparisonBarProps>;
