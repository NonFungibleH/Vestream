/**
 * Build a fully-authenticated The Graph gateway URL from a bare subgraph ID.
 *
 * The Graph gateway accepts the API key embedded in the URL path:
 *   https://gateway.thegraph.com/api/{GRAPH_API_KEY}/subgraphs/id/{ID}
 *
 * Set GRAPH_API_KEY in .env.local (get yours at https://thegraph.com/studio/).
 * All subgraph adapters call this instead of hard-coding credentials.
 *
 * Returns undefined if GRAPH_API_KEY is not set, causing the adapter to skip
 * that chain silently (no crash, just no data).
 */
export function buildGraphUrl(subgraphId: string): string | undefined {
  const key = process.env.GRAPH_API_KEY;
  if (!key) {
    // Warn once per cold start — won't spam because Next.js caches modules
    console.warn(
      `[TokenVest] GRAPH_API_KEY is not set. ` +
      `Subgraph ${subgraphId.slice(0, 8)}… will be skipped. ` +
      `Get a key at https://thegraph.com/studio/`
    );
    return undefined;
  }
  return `https://gateway.thegraph.com/api/${key}/subgraphs/id/${subgraphId}`;
}

/**
 * Convenience: also accepts a full URL (env-var style, API key already embedded).
 * Falls back to buildGraphUrl if a bare ID is passed.
 */
export function resolveSubgraphUrl(
  envUrl: string | undefined,
  subgraphId?: string
): string | undefined {
  if (envUrl) return envUrl;
  if (subgraphId) return buildGraphUrl(subgraphId);
  return undefined;
}
