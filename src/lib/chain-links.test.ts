import { describe, it, expect } from "vitest";
import {
  blockExplorerUrl,
  tokenSnifferUrl,
  xSearchUrl,
  blockExplorerName,
  tokenSnifferName,
  isLinkableTokenAddress,
} from "./chain-links";
import { normaliseAddress } from "./address-validation";
import { getAddress } from "viem";

const EVM_TOKEN = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"; // UNI
const SOL_MINT  = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC on Solana

describe("blockExplorerUrl", () => {
  it("returns Etherscan for Ethereum EVM token", () => {
    expect(blockExplorerUrl(1, EVM_TOKEN)).toBe(`https://etherscan.io/token/${EVM_TOKEN}`);
  });
  it("returns BscScan for BSC", () => {
    expect(blockExplorerUrl(56, EVM_TOKEN)).toBe(`https://bscscan.com/token/${EVM_TOKEN}`);
  });
  it("returns Solscan for Solana SPL mint", () => {
    expect(blockExplorerUrl(101, SOL_MINT)).toBe(`https://solscan.io/token/${SOL_MINT}`);
  });
  it("rejects Solana address on EVM chain", () => {
    expect(blockExplorerUrl(1, SOL_MINT)).toBeNull();
  });
  it("rejects EVM address on Solana chain", () => {
    expect(blockExplorerUrl(101, EVM_TOKEN)).toBeNull();
  });
  it("returns null for unsupported chainId", () => {
    expect(blockExplorerUrl(999, EVM_TOKEN)).toBeNull();
  });
});

describe("tokenSnifferUrl", () => {
  it("routes to TokenSniffer on EVM", () => {
    expect(tokenSnifferUrl(1, EVM_TOKEN)).toContain("tokensniffer.com/token/ethereum/");
  });
  it("routes to RugCheck on Solana", () => {
    expect(tokenSnifferUrl(101, SOL_MINT)).toBe(`https://rugcheck.xyz/tokens/${SOL_MINT}`);
  });
});

describe("blockExplorerName / tokenSnifferName", () => {
  it("returns Solscan for 101", () => {
    expect(blockExplorerName(101)).toBe("Solscan");
  });
  it("returns RugCheck for 101", () => {
    expect(tokenSnifferName(101)).toBe("RugCheck");
  });
  it("returns TokenSniffer for EVM mainnets", () => {
    expect(tokenSnifferName(1)).toBe("TokenSniffer");
    expect(tokenSnifferName(8453)).toBe("TokenSniffer");
  });
});

describe("xSearchUrl", () => {
  it("works for Solana mints", () => {
    const url = xSearchUrl("USDC", SOL_MINT);
    expect(url).toContain("x.com/search");
    expect(url).toContain("USDC");
  });
  it("works for EVM addresses", () => {
    const url = xSearchUrl("UNI", EVM_TOKEN);
    expect(url).toContain("x.com/search");
  });
});

// Regression guard for the "only some Streamflow tokens are clickable / token
// page empty" bug (2026-07-01). Solana mints are case-SENSITIVE base58, and
// base58 excludes 0/O/I/l. A real Streamflow mint (RELAX) contains an uppercase
// "L"; blindly `.toLowerCase()`-ing it (the EVM habit) turns that L into an "l"
// — not a valid base58 char — so `isLinkableTokenAddress` starts returning
// false and the /token link either vanishes or 404s. The fix is to build token
// links + linkability off the ecosystem-aware `normaliseAddress` (EVM → lower,
// Solana → preserved), NEVER a raw `.toLowerCase()`.
describe("Solana token address case-sensitivity (never .toLowerCase a mint)", () => {
  const SOL_MINT_WITH_L = "tsSYSwL8ZU59eXzPXwUoNo4dXHTtmqrD2MrY3xjpump"; // RELAX

  it("a correct-case Solana mint containing 'L' is linkable", () => {
    expect(isLinkableTokenAddress(SOL_MINT_WITH_L)).toBe(true);
  });

  it("lowercasing that mint breaks linkability (L→l is not base58)", () => {
    expect(isLinkableTokenAddress(SOL_MINT_WITH_L.toLowerCase())).toBe(false);
  });

  it("normaliseAddress PRESERVES the Solana mint so it stays linkable", () => {
    const normalised = normaliseAddress(SOL_MINT_WITH_L);
    expect(normalised).toBe(SOL_MINT_WITH_L); // unchanged, not lowercased
    expect(isLinkableTokenAddress(normalised)).toBe(true);
  });

  it("normaliseAddress still lowercases a checksummed EVM address", () => {
    const checksummed = getAddress(EVM_TOKEN); // EIP-55 mixed-case form of UNI
    expect(checksummed).not.toBe(EVM_TOKEN);   // sanity: it really is mixed-case
    expect(normaliseAddress(checksummed)).toBe(EVM_TOKEN); // → lowercase canonical
  });
});
