import { VestingStream, SupportedChainId } from "../types";

// Every vesting platform implements this interface.
// To add a new platform: create a file, export an adapter, register it below.
export interface VestingAdapter {
  /** Unique machine-readable ID. Used as protocol field prefix. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Chain IDs this adapter supports. */
  supportedChainIds: SupportedChainId[];
  /**
   * Fetch all vesting streams for the given wallet addresses on one chain.
   * Must return [] (not throw) if the data source is unavailable.
   */
  fetch(wallets: string[], chainId: SupportedChainId): Promise<VestingStream[]>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────
// Import adapters and add them here. Order does not matter.

import { sablierAdapter }     from "./sablier";
import { hedgeyAdapter }      from "./hedgey";
import { teamFinanceAdapter } from "./team-finance";
import { uncxAdapter }        from "./uncx";
import { uncxVmAdapter }      from "./uncx-vm";
import { unvestAdapter }      from "./unvest";
import { superfluidAdapter }  from "./superfluid";
import { pinksaleAdapter }    from "./pinksale";

export const ADAPTER_REGISTRY: VestingAdapter[] = [
  sablierAdapter,
  hedgeyAdapter,
  teamFinanceAdapter,
  uncxAdapter,
  uncxVmAdapter,
  unvestAdapter,
  superfluidAdapter,
  pinksaleAdapter,
];
