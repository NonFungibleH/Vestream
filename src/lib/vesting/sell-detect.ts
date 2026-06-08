// src/lib/vesting/sell-detect.ts
// ─────────────────────────────────────────────────────────────────────────────
// Auto sell-detection (gains): finds every time the user disposed of a vested
// token — sold (DEX swap) or transferred out — by reading their outbound ERC-20
// transfers via Alchemy's getAssetTransfers, then maps them to "disposal
// candidates" the user confirms into the gains ledger.
//
// v1: ETH + Base only (the chains we have Alchemy keys for). Other chains come
// later via a multi-chain transfers provider.
//
// The mapping (transfersToCandidates) is a PURE, unit-tested function; the fetch
// (fetchOutboundTransfers) does the network I/O. See the spec at
// docs/superpowers/specs/2026-06-08-auto-sell-detection-design.md.
// ─────────────────────────────────────────────────────────────────────────────

import { CHAIN_IDS, type SupportedChainId } from "./types";

/** Subset of an Alchemy `getAssetTransfers` row we care about. */
export interface RawTransfer {
  uniqueId:       string;          // Alchemy dedup id (hash + logIndex + category)
  hash:           string;
  from:           string;
  to:             string | null;   // null for contract-creation etc.
  rawValueHex:    string | null;   // rawContract.value (hex, base units) — preferred
  decimals:       number | null;   // rawContract.decimal (decoded)
  value:          number | null;   // Alchemy decimal value (token units) — fallback
  blockTimestamp: string;          // metadata.blockTimestamp (ISO)
}

export interface DisposalCandidate {
  chainId:          number;
  tokenAddress:     string;        // lowercased
  txHash:           string;
  uniqueId:         string;
  toAddress:        string;        // lowercased
  amountRaw:        string;        // token base units, stringified bigint
  occurredAt:       string;        // ISO
  internalTransfer: boolean;       // `to` is one of the user's own tracked wallets
}

/** Chains we can scan today (have an Alchemy endpoint for). */
export const SELL_DETECT_CHAINS: SupportedChainId[] = [CHAIN_IDS.ETHEREUM, CHAIN_IDS.BASE];

export function isSellDetectSupported(chainId: number): boolean {
  return SELL_DETECT_CHAINS.includes(chainId as SupportedChainId);
}

/** Best-effort base-unit amount: prefer the exact hex rawValue; otherwise scale
 *  the decimal value by 10^decimals (lossy for fractional dust but fine for a
 *  user-reviewed candidate). */
function toBaseUnits(tx: RawTransfer): string | null {
  if (tx.rawValueHex) {
    try { return BigInt(tx.rawValueHex).toString(); } catch { /* fall through */ }
  }
  if (tx.value != null && tx.decimals != null && Number.isFinite(tx.value)) {
    // Avoid float drift: split into integer + fractional parts.
    const [intPart, fracPartRaw = ""] = String(tx.value).split(".");
    const frac = (fracPartRaw + "0".repeat(tx.decimals)).slice(0, tx.decimals);
    try { return (BigInt(intPart) * 10n ** BigInt(tx.decimals) + BigInt(frac || "0")).toString(); }
    catch { return null; }
  }
  return null;
}

/**
 * Map raw outbound transfers → disposal candidates. Pure.
 * - drops rows with no recipient or no timestamp,
 * - flags transfers to the user's own tracked wallets as `internalTransfer`,
 * - dedupes by Alchemy `uniqueId`.
 */
export function transfersToCandidates(
  transfers:    RawTransfer[],
  ownWallets:   string[],
  chainId:      number,
  tokenAddress: string,
): DisposalCandidate[] {
  const own = new Set(ownWallets.map((w) => w.toLowerCase()));
  const token = tokenAddress.toLowerCase();
  const seen = new Set<string>();
  const out: DisposalCandidate[] = [];

  for (const tx of transfers) {
    if (!tx.to || !tx.blockTimestamp) continue;
    if (seen.has(tx.uniqueId)) continue;
    const amountRaw = toBaseUnits(tx);
    if (amountRaw == null) continue;
    seen.add(tx.uniqueId);
    const to = tx.to.toLowerCase();
    out.push({
      chainId,
      tokenAddress:     token,
      txHash:           tx.hash,
      uniqueId:         tx.uniqueId,
      toAddress:        to,
      amountRaw,
      occurredAt:       tx.blockTimestamp,
      internalTransfer: own.has(to),
    });
  }
  return out;
}

function alchemyUrlFor(chainId: number): string | undefined {
  if (chainId === CHAIN_IDS.ETHEREUM) return process.env.ALCHEMY_RPC_URL_ETH;
  if (chainId === CHAIN_IDS.BASE)     return process.env.ALCHEMY_RPC_URL_BASE ?? process.env.ALCHEMY_RPC_URL;
  return undefined;
}

/**
 * Fetch all outbound ERC-20 transfers of `tokenAddress` from `wallet` on a
 * supported chain via Alchemy `alchemy_getAssetTransfers`. Paginated. Returns
 * [] for unsupported chains, during `next build`, or on error (callers degrade
 * gracefully — a failed scan shows no candidates rather than breaking).
 */
export async function fetchOutboundTransfers(
  chainId:      number,
  wallet:       string,
  tokenAddress: string,
): Promise<RawTransfer[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") return [];
  if (!isSellDetectSupported(chainId)) return [];
  const url = alchemyUrlFor(chainId);
  if (!url) return [];

  const all: RawTransfer[] = [];
  let pageKey: string | undefined;
  // Bound the loop — a single wallet won't realistically exceed this for one token.
  for (let page = 0; page < 20; page++) {
    const params: Record<string, unknown> = {
      fromBlock:        "0x0",
      toBlock:          "latest",
      fromAddress:      wallet,
      contractAddresses: [tokenAddress],
      category:         ["erc20"],
      withMetadata:     true,
      excludeZeroValue: true,
      order:            "asc",
      maxCount:         "0x3e8", // 1000
      ...(pageKey ? { pageKey } : {}),
    };
    let json: {
      result?: {
        transfers?: Array<{
          uniqueId?: string; hash?: string; from?: string; to?: string | null;
          value?: number | null; metadata?: { blockTimestamp?: string };
          rawContract?: { value?: string | null; decimal?: string | null };
        }>;
        pageKey?: string;
      };
    };
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: 1, jsonrpc: "2.0", method: "alchemy_getAssetTransfers", params: [params] }),
      });
      if (!res.ok) break;
      json = await res.json();
    } catch {
      break;
    }
    const rows = json.result?.transfers ?? [];
    for (const r of rows) {
      if (!r.hash || !r.uniqueId) continue;
      all.push({
        uniqueId:       r.uniqueId,
        hash:           r.hash,
        from:           r.from ?? wallet,
        to:             r.to ?? null,
        rawValueHex:    r.rawContract?.value ?? null,
        decimals:       r.rawContract?.decimal ? Number.parseInt(r.rawContract.decimal, 16) : null,
        value:          r.value ?? null,
        blockTimestamp: r.metadata?.blockTimestamp ?? "",
      });
    }
    pageKey = json.result?.pageKey;
    if (!pageKey) break;
  }
  return all;
}
