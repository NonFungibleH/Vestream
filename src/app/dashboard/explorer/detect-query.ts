// Smart-input router. Given whatever the user typed in the search box,
// decide what kind of query it is. Used both by the server page (to
// short-circuit unnecessary queries) and the client search input (to
// give the user a typeahead hint while they type).
//
// Decision order:
//   1. ENS-like name        → ens
//   2. EVM address regex    → address (evm)
//   3. Solana base58 length → address (solana)
//   4. Known protocol slug  → protocol
//   5. Short alphanumeric   → symbol
//   6. Anything else        → freeform
//
// We never throw on garbage — every query is at worst classified as
// "freeform" and the result page handles that with a "no match" empty.

import { PROTOCOL_SLUGS } from "@/lib/protocol-constants";

export type QueryKind =
  | { kind: "empty" }
  | { kind: "ens";       name: string }
  | { kind: "address";   ecosystem: "evm" | "solana"; address: string }
  | { kind: "protocol";  slug: string }
  | { kind: "symbol";    symbol: string }
  | { kind: "freeform";  text: string };

const EVM_ADDRESS_RE      = /^0x[0-9a-f]{40}$/i;
const SOLANA_BASE58_RE    = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
// ENS — anything ending in .eth (and a few less-common TLDs we encounter
// often enough). Doesn't try to validate the full ENS namehash; a server-
// side viem `getEnsAddress()` call is the source of truth and will reject
// anything that doesn't actually resolve.
const ENS_LIKE_RE         = /\.(eth|xyz|crypto|nft)$/i;
const SYMBOL_RE           = /^[A-Z0-9$]{2,12}$/i;

const PROTOCOL_SLUG_SET   = new Set<string>(PROTOCOL_SLUGS);
// Map common aliases users might type to the canonical slug.
const PROTOCOL_ALIASES: Record<string, string> = {
  "uncx-vm":     "uncx",
  "uncx-network": "uncx",
  "pinklock":    "pinksale",
  "pink-sale":   "pinksale",
  "stream-flow": "streamflow",
  "jupiter":     "jupiter-lock",
  "jup":         "jupiter-lock",
};

export function detectQueryKind(input: string): QueryKind {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };

  // 1. ENS
  if (ENS_LIKE_RE.test(trimmed)) {
    return { kind: "ens", name: trimmed.toLowerCase() };
  }

  // 2. EVM address
  if (EVM_ADDRESS_RE.test(trimmed)) {
    return { kind: "address", ecosystem: "evm", address: trimmed.toLowerCase() };
  }

  // 3. Solana base58 — must NOT match EVM (caught above), and length 32-44
  if (SOLANA_BASE58_RE.test(trimmed) && trimmed.length >= 32 && trimmed.length <= 44) {
    return { kind: "address", ecosystem: "solana", address: trimmed };
  }

  const lower = trimmed.toLowerCase();

  // 4. Known protocol slug or alias
  if (PROTOCOL_SLUG_SET.has(lower)) {
    return { kind: "protocol", slug: lower };
  }
  const aliased = PROTOCOL_ALIASES[lower];
  if (aliased) {
    return { kind: "protocol", slug: aliased };
  }

  // 5. Token symbol — short alphanumeric, all-caps or mixed
  if (SYMBOL_RE.test(trimmed)) {
    return { kind: "symbol", symbol: trimmed.toUpperCase() };
  }

  // 6. Anything else
  return { kind: "freeform", text: trimmed };
}

/**
 * Build a routing destination URL from a parsed query. Used by the
 * search input to send users to the right surface on submit.
 *
 * Address / ENS / protocol → existing detail pages
 * Symbol / freeform        → stay on /dashboard/explorer with the query
 */
export function destinationForQuery(parsed: QueryKind): string {
  switch (parsed.kind) {
    case "address":
      // Wallet-mode result tab — server will look up positions for this address.
      return `/dashboard/explorer?q=${encodeURIComponent(parsed.address)}&mode=wallet`;
    case "ens":
      // Same — server resolves the ENS to an address before querying.
      return `/dashboard/explorer?q=${encodeURIComponent(parsed.name)}&mode=wallet`;
    case "protocol":
      return `/dashboard/explorer?protocol=${encodeURIComponent(parsed.slug)}&mode=calendar`;
    case "symbol":
      return `/dashboard/explorer?q=${encodeURIComponent(parsed.symbol)}&mode=calendar`;
    case "freeform":
      return `/dashboard/explorer?q=${encodeURIComponent(parsed.text)}&mode=calendar`;
    default:
      return "/dashboard/explorer";
  }
}
