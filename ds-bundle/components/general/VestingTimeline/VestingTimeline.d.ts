import * as React from 'react';

/**
 * VestingTimeline — from vestr@0.1.0.
 */
export interface VestingTimelineProps {
  streams: VestingStream[];
  showRecipient?: boolean;
}

export declare const VestingTimeline: React.ComponentType<VestingTimelineProps>;
