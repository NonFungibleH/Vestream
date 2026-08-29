import * as React from 'react';

/**
 * UpcomingUnlockTicker — from vestr@0.1.0.
 */
export interface UpcomingUnlockTickerProps {
/** Server-rendered first page from `/api/unlocks/upcoming`; the ticker revalidates client-side. */
  initialData?: UpcomingResponse | null;
}

export declare const UpcomingUnlockTicker: React.ComponentType<UpcomingUnlockTickerProps>;
