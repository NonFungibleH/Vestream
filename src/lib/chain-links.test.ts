import { describe, it, expect } from "vitest";
import {
  blockExplorerUrl,
  tokenSnifferUrl,
  xSearchUrl,
  blockExplorerName,
  tokenSnifferName,
} from "./chain-links";

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
