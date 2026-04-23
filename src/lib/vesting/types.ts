// src/lib/vesting/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Thin re-export shim. The authoritative source for these types lives at
// `packages/shared/src/vesting.ts` so the mobile app, MCP server, and any
// future client can import the same definitions.
//
// Why keep this shim:
//   - The codebase has ~12 files importing from "@/lib/vesting/types" today.
//     Rather than rename those in a single mega-PR, we keep the old path
//     working and move the definitions underneath.
//   - New code should import from "@vestream/shared" instead — this file will
//     eventually be deleted once the in-tree references all migrate.
// ─────────────────────────────────────────────────────────────────────────────

export {
  CHAIN_IDS,
  CHAIN_NAMES,
  TESTNET_CHAIN_IDS,
  ALL_CHAIN_IDS,
  computeLinearVesting,
  nextUnlockTime,
  computeStepVesting,
  nextUnlockTimeForSteps,
} from "@vestream/shared";

export type {
  SupportedChainId,
  VestingStream,
} from "@vestream/shared";
