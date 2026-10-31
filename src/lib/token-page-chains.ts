// src/lib/token-page-chains.ts
// ─────────────────────────────────────────────────────────────────────────────
// Chains that have a public /token/{chainId}/{address} page, plus a cheap
// path check. Shared by the page and by src/middleware.ts, which uses it to
// return a real 404 for impossible token URLs BEFORE the route's loading.tsx
// starts streaming: once the skeleton has flushed, the page's notFound() can
// only produce a 200 with noindex (a soft 404 in Search Console).
//
// Kept dependency-free so the middleware bundle stays small — the full
// validators in lib/address-validation pull in viem + @solana/web3.js.
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_PAGE_CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  43114: "Avalanche",
  4663: "Robinhood Chain",
  101: "Solana",
};

const SOLANA_CHAIN_ID = 101;
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
// base58 alphabet (no 0, O, I, l); ed25519 pubkeys encode to 32–44 chars.
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * True when /token/{chainId}/{address} could be a real token page: a chain we
 * publish pages for and an address in that chain's format. A shape check only;
 * the page still runs the full validators and renders "no vesting found"
 * (noindex) for well-formed addresses we hold nothing for.
 */
export function isPlausibleTokenPath(chainId: string, address: string): boolean {
  const cid = Number(chainId);
  if (!Number.isInteger(cid) || !TOKEN_PAGE_CHAIN_NAMES[cid]) return false;
  let addr: string;
  try { addr = decodeURIComponent(address); } catch { return false; }
  return cid === SOLANA_CHAIN_ID ? SOLANA_ADDRESS_RE.test(addr) : EVM_ADDRESS_RE.test(addr);
}
