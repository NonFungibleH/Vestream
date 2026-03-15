import { ADAPTER_REGISTRY } from "./adapters/index";
import { VestingStream, SupportedChainId, ALL_CHAIN_IDS } from "./types";

/**
 * Fetch all vesting streams for the given wallets across all requested chains.
 * Each adapter+chain combination runs concurrently. Failed adapters return []
 * so a single bad data source never blocks the rest.
 *
 * @param wallets     - checksummed or lowercased wallet addresses
 * @param chainIds    - subset of supported chains to query (defaults to all)
 * @param protocolIds - subset of adapter IDs to query (defaults to all)
 */
export async function aggregateVestingStreams(
  wallets: string[],
  chainIds: SupportedChainId[] = ALL_CHAIN_IDS,
  protocolIds?: string[],
): Promise<VestingStream[]> {
  // Build the list of (adapter, chainId) pairs to run
  const tasks: Array<{ adapterId: string; chainId: SupportedChainId; promise: Promise<VestingStream[]> }> = [];

  for (const adapter of ADAPTER_REGISTRY) {
    // Skip adapters not in the optional protocol filter
    if (protocolIds && protocolIds.length > 0 && !protocolIds.includes(adapter.id)) continue;

    for (const chainId of chainIds) {
      if (!adapter.supportedChainIds.includes(chainId)) continue;
      tasks.push({
        adapterId: adapter.id,
        chainId,
        promise: adapter.fetch(wallets, chainId).catch((err) => {
          console.error(`Adapter ${adapter.id} (chain ${chainId}) threw unexpectedly:`, err);
          return [];
        }),
      });
    }
  }

  const results = await Promise.all(tasks.map((t) => t.promise));

  const allStreams: VestingStream[] = results.flat();

  // Sort: active streams by nextUnlockTime ascending, fully vested last
  return allStreams.sort((a, b) => {
    if (a.nextUnlockTime === null && b.nextUnlockTime === null) return 0;
    if (a.nextUnlockTime === null) return 1;
    if (b.nextUnlockTime === null) return -1;
    return a.nextUnlockTime - b.nextUnlockTime;
  });
}
