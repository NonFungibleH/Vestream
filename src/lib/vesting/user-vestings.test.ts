import { describe, it, expect } from "vitest";
import { mergeVestingTokens } from "./user-vestings";

describe("mergeVestingTokens", () => {
  it("returns [] for no streams", () => {
    expect(mergeVestingTokens([], [])).toEqual([]);
  });

  it("groups streams by (chain, token), dedupes protocols, attaches claim totals", () => {
    const out = mergeVestingTokens(
      [
        { chainId: 1, tokenAddress: "0xAAA", tokenSymbol: "NOVA", protocol: "sablier" },
        { chainId: 1, tokenAddress: "0xaaa", tokenSymbol: "NOVA", protocol: "hedgey" },  // same token, diff protocol, mixed case
        { chainId: 1, tokenAddress: "0xBBB", tokenSymbol: "FLUX", protocol: "uncx" },
      ],
      [
        { chainId: 1, tokenAddress: "0xaaa", claimCount: 3, totalUsd: 120.5, lastClaimAt: new Date("2026-06-03T00:00:00Z") },
      ],
    );
    expect(out).toHaveLength(2);
    const nova = out.find((t) => t.tokenSymbol === "NOVA")!;
    expect(nova.tokenAddress).toBe("0xaaa");          // lowercased
    expect(nova.protocols.sort()).toEqual(["hedgey", "sablier"]);
    expect(nova.claimCount).toBe(3);
    expect(nova.totalClaimedUsd).toBe(120.5);
    expect(nova.lastClaimAt).toBe("2026-06-03T00:00:00.000Z");
    const flux = out.find((t) => t.tokenSymbol === "FLUX")!;
    expect(flux.claimCount).toBe(0);
    expect(flux.totalClaimedUsd).toBeNull();
  });

  it("sorts by totalClaimedUsd desc (NOVA priced, FLUX unpriced)", () => {
    const out = mergeVestingTokens(
      [
        { chainId: 1, tokenAddress: "0xBBB", tokenSymbol: "FLUX", protocol: "uncx" },
        { chainId: 1, tokenAddress: "0xAAA", tokenSymbol: "NOVA", protocol: "sablier" },
      ],
      [{ chainId: 1, tokenAddress: "0xaaa", claimCount: 1, totalUsd: 50, lastClaimAt: null }],
    );
    expect(out[0].tokenSymbol).toBe("NOVA");
  });

  it("skips streams with no token address", () => {
    const out = mergeVestingTokens(
      [{ chainId: 101, tokenAddress: null, tokenSymbol: "SOL?", protocol: "jupiter-lock" }],
      [],
    );
    expect(out).toEqual([]);
  });
});
