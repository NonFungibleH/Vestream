// src/lib/fetch-with-retry.test.ts
// Unit tests for the retry wrapper. Covers the decision tree explicitly — a
// subtle off-by-one that retries 4xx (caller bug, not a transient) or doesn't
// retry 5xx (transient, should retry) would produce exactly the kind of
// silent-failure mode the wrapper exists to prevent.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchWithRetry } from "./fetch-with-retry";

function mockResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  } as unknown as Response;
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    // Collapse all backoff/jitter to zero so tests are fast AND deterministic.
    // We're testing branch behaviour, not timing.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the response on first success without retrying", async () => {
    const mock = vi.fn<() => Promise<Response>>().mockResolvedValue(mockResponse(200));
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { backoffMs: 0, jitterMs: 0 });
    expect(res?.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and returns the eventual 2xx", async () => {
    const mock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(mockResponse(502))
      .mockResolvedValueOnce(mockResponse(503))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { retries: 2, backoffMs: 0, jitterMs: 0 });
    expect(res?.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("retries 429 (rate limit) — it's a transient, not a caller bug", async () => {
    const mock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(mockResponse(429))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { retries: 2, backoffMs: 0, jitterMs: 0 });
    expect(res?.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry 4xx (other than 429) — that's a caller bug", async () => {
    const mock = vi.fn<() => Promise<Response>>().mockResolvedValue(mockResponse(400));
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { retries: 5, backoffMs: 0, jitterMs: 0 });
    expect(res?.status).toBe(400);
    expect(mock).toHaveBeenCalledTimes(1); // no retries — bad request stays bad
  });

  it("returns the final 5xx response when retries exhaust", async () => {
    const mock = vi.fn<() => Promise<Response>>().mockResolvedValue(mockResponse(503));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { retries: 2, backoffMs: 0, jitterMs: 0 });
    expect(res?.status).toBe(503);
    expect(mock).toHaveBeenCalledTimes(3); // retries + 1
    expect(warn).toHaveBeenCalled();
  });

  it("retries thrown network errors and returns null on exhaustion", async () => {
    const mock = vi.fn<() => Promise<Response>>().mockRejectedValue(new Error("ECONNRESET"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { retries: 2, backoffMs: 0, jitterMs: 0 });
    expect(res).toBeNull();
    expect(mock).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
  });

  it("throws on exhaustion when throwOnFail is set", async () => {
    const mock = vi.fn<() => Promise<Response>>().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", mock);

    await expect(
      fetchWithRetry("https://example.com", undefined, {
        retries: 1, backoffMs: 0, jitterMs: 0, throwOnFail: true,
      }),
    ).rejects.toThrow("ECONNRESET");
  });

  it("treats a one-off network error + recovery as success", async () => {
    const mock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, { retries: 2, backoffMs: 0, jitterMs: 0 });
    expect(res?.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("honours the retryOn list for caller-specific statuses", async () => {
    // 408 Request Timeout isn't in the default retry set, but some upstreams
    // use it instead of 503. Opt-in retry via the config.
    const mock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(mockResponse(408))
      .mockResolvedValueOnce(mockResponse(200));
    vi.stubGlobal("fetch", mock);

    const res = await fetchWithRetry("https://example.com", undefined, {
      retries: 2, backoffMs: 0, jitterMs: 0, retryOn: [408],
    });
    expect(res?.status).toBe(200);
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
