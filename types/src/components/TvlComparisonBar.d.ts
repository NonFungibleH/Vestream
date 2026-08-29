import { type ProtocolMeta } from "@/lib/protocol-constants";
import type { ProtocolTvl } from "@/lib/vesting/tvl";
export interface TvlComparisonRow {
    protocol: ProtocolMeta;
    tvl: ProtocolTvl | null;
    /** Indexed-cache active stream count from getProtocolStats. Used in
     *  the row's sub-label "{N} active streams across {C} blockchains". */
    activeStreams?: number | null;
    /** Number of chains we actually have INDEXED data on (stats.chainIds).
     *  Preferred over protocol.chainIds (declared) so a declared-but-empty
     *  chain – e.g. Team Finance on Base – isn't counted. Falls back to the
     *  declared count when null (cold cache). */
    indexedChainCount?: number | null;
    /**
     * @deprecated since 2026-05-10 – totalStreams is no longer rendered.
     * Including ended/fully-withdrawn rows inflated the count without
     * reflecting current activity. Kept on the type so callers can keep
     * passing it without a TS error during the rollout; it's ignored.
     */
    totalStreams?: number | null;
}
export declare function TvlComparisonBar({ rows, externallySourced, snapshotAgeHours, }: {
    rows: TvlComparisonRow[];
    /** Slugs whose TVL came from an external source (e.g. DefiLlama)
     *  rather than our own priced-cache computation. Rendered with a
     *  small attribution tag so the reader can distinguish the two. */
    externallySourced?: Set<string>;
    /** Age of the oldest snapshot row (hours). Surfaced in the (i) tooltip
     *  as a "last verified X ago" signal so the reader knows how fresh the
     *  numbers are. Null when no snapshot exists yet. */
    snapshotAgeHours?: number | null;
}): import("react/jsx-runtime").JSX.Element;
