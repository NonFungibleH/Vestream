export interface RetryOpts {
    /** Total attempts = retries + 1. Default: 2 (3 attempts total). */
    retries?: number;
    /** Initial wait in ms; doubles each attempt. Default: 300. */
    backoffMs?: number;
    /** Uniform random jitter 0..jitterMs added to each wait. Default: 100. */
    jitterMs?: number;
    /**
     * Extra HTTP statuses to retry beyond the default (5xx + 429). Mostly
     * useful for upstreams that return 408 or custom "try later" codes.
     */
    retryOn?: number[];
    /** Throw on total failure instead of returning null. Default: false. */
    throwOnFail?: boolean;
    /** Optional tag for logs (e.g. "dexscreener" → "[fetch-retry dexscreener] …"). */
    tag?: string;
    /**
     * Per-attempt timeout in ms. Default: 8000 (8s).
     *
     * Without this, a slow upstream (DexScreener, subgraph, RPC) hangs the
     * caller indefinitely. We've had at least one production incident where
     * /protocols pages stopped rendering because DexScreener was returning
     * 200s but holding the connection open for 60+ seconds — long enough to
     * blow the lambda's 60s execution limit.
     *
     * 8s is generous for healthy upstreams (typical response < 500ms), short
     * enough to surface "upstream is sick, fall through to fallback" within
     * a reasonable page-load budget. Each retry attempt gets its own 8s
     * window, so the worst case for `retries: 2` is 8 + 8 + 8 = 24s plus
     * backoff — still finishes inside Vercel's lambda timeout.
     */
    timeoutMs?: number;
}
export declare function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, opts?: RetryOpts): Promise<Response | null>;
