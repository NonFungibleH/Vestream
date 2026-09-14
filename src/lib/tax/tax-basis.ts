// src/lib/tax/tax-basis.ts
// ─────────────────────────────────────────────────────────────────────────────
// The tax basis a user reports vesting income on:
//   "claim"  — income recognised when tokens are withdrawn/claimed (default)
//   "unlock" — income recognised when tokens vest/become available (accrual)
//
// Which is correct depends on the user's jurisdiction — some tax at unlock,
// some at claim. Claim stays the default; unlock is opt-in. See the tax
// dashboard's basis toggle and the disclaimer.
// ─────────────────────────────────────────────────────────────────────────────

export type TaxBasis = "claim" | "unlock";

export const DEFAULT_TAX_BASIS: TaxBasis = "claim";

export function isTaxBasis(x: unknown): x is TaxBasis {
  return x === "claim" || x === "unlock";
}
