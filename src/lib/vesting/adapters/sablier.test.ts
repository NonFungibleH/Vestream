// src/lib/vesting/adapters/sablier.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Golden-snapshot test for the Sablier adapter's normalisation logic.
//
// Pattern that every adapter test file should follow:
//   1. Freeze the clock at a known time (so claimableNow/lockedAmount math is
//      deterministic — otherwise tests would silently drift every day).
//   2. Mock `globalThis.fetch` to return a saved Envio response.
//   3. Call adapter.fetch() through its public surface.
//   4. Assert on the normalised VestingStream output — one test per interesting
//      stream shape in the fixture.
//
// Why this matters: Sablier migrated off The Graph onto Envio HyperIndex in
// 2025 (root field renamed `streams` → `LockupStream`, `token` → `asset`,
// `withdrawals` → `actions`). That exact schema flip caused a silent prod
// outage; this test guards against the same class of drift now that we're
// on Envio.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sablierAdapter } from "./sablier";
import { CHAIN_IDS } from "@vestream/shared";
import fixture from "./__fixtures__/sablier.v2.json";

// Pinned "now" — chosen so stream #1 is mid-vest, stream #2 is fully vested,
// and stream #3 is still pre-cliff. Changing this breaks every amount
// assertion below, which is the point — the test is about a fixed scenario.
const FROZEN_NOW_SEC = 1_700_000_500; // 500 seconds into stream #1's 1000s schedule

describe("sablierAdapter — Envio HyperIndex normalisation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW_SEC * 1000);

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() { return fixture; },
    }) as unknown as Response));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns one VestingStream per raw stream in the subgraph response", async () => {
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    expect(streams).toHaveLength(3);
  });

  it("emits the canonical composite id format", async () => {
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    // id = `sablier-{chainId}-{streamId}` — the single format consumed by all
    // downstream code, including the cache key and the public API URLs.
    expect(streams[0].id).toBe("sablier-1-12345");
    expect(streams[1].id).toBe("sablier-1-67890");
    expect(streams[2].id).toBe("sablier-1-11111");
  });

  it("stream #1 is mid-vest (500/1000 seconds elapsed → half claimable)", async () => {
    const [s1] = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    expect(s1.protocol).toBe("sablier");
    expect(s1.tokenSymbol).toBe("USDC");
    expect(s1.tokenDecimals).toBe(6);
    expect(s1.totalAmount).toBe("1000000000");
    expect(s1.withdrawnAmount).toBe("0");
    // Linear vest at exactly the midpoint → 500 USDC claimable, 500 locked.
    expect(s1.claimableNow).toBe("500000000");
    expect(s1.lockedAmount).toBe("500000000");
    expect(s1.isFullyVested).toBe(false);
    expect(s1.cliffTime).toBeNull();
    // Linear (non-tranched) streams map to shape="linear".
    expect(s1.shape).toBe("linear");
  });

  it("stream #2 is fully vested and fully withdrawn", async () => {
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    const s2 = streams[1];
    expect(s2.isFullyVested).toBe(true);
    expect(s2.claimableNow).toBe("0");     // already withdrew the full amount
    expect(s2.lockedAmount).toBe("0");
    expect(s2.tokenSymbol).toBe("USDT");
    // claimEvents must be preserved in the normalised shape so the UI can
    // show the withdrawal timeline.
    expect(s2.claimEvents).toHaveLength(2);
    expect(s2.claimEvents![0].amount).toBe("250000000");
  });

  it("stream #3 is pre-cliff — nothing claimable, nextUnlockTime === cliffTime", async () => {
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    const s3 = streams[2];
    expect(s3.cliffTime).toBe(1_705_000_000);
    // At FROZEN_NOW_SEC (1.7B + 500), we're well before the cliff — technically
    // the linear vest math is still ticking (small fraction), but the UI
    // relies on nextUnlockTime pointing at the cliff until it passes.
    expect(s3.nextUnlockTime).toBe(1_705_000_000);
    expect(s3.isFullyVested).toBe(false);
  });

  it("preserves cancelable flag from the subgraph", async () => {
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    expect(streams[0].cancelable).toBe(true);
    expect(streams[1].cancelable).toBe(false);
    expect(streams[2].cancelable).toBe(true);
  });

  it("returns empty array on upstream HTTP failure (never throws)", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      async json() { return {}; },
    }) as unknown as Response));

    // Silence the expected error log so CI output stays clean.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    expect(streams).toEqual([]);
    expect(err).toHaveBeenCalled();
  });

  it("returns empty array when upstream responds with graphql errors", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return { errors: [{ message: "bad query" }] };
      },
    }) as unknown as Response));

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.ETHEREUM,
    );
    expect(streams).toEqual([]);
    expect(err).toHaveBeenCalled();
  });

  it("returns empty array for chains Sablier doesn't support", async () => {
    // Base Sepolia has no Sablier deployment — chainId isn't in SUPPORTED_CHAINS,
    // so the adapter must short-circuit before even calling fetch.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const streams = await sablierAdapter.fetch(
      ["0x1111111111111111111111111111111111111111"],
      CHAIN_IDS.BASE_SEPOLIA,
    );
    expect(streams).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
