// src/lib/fetch-with-retry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper around `fetch` that retries transient failures with exponential
// backoff + jitter. Used by every upstream we don't control (DexScreener, The
// Graph, RPC nodes) so a single hiccup doesn't blank the TVL bar or empty a
// user's dashboard.
//
// Retry policy:
//   - Network errors (fetch throws) → always retry
//   - HTTP 5xx + 429                → retry (these are transient)
//   - HTTP 4xx (other than 429)     → return immediately (caller's bug; retrying
//                                     just wastes the remote's patience)
//   - HTTP 2xx/3xx                  → return immediately (success)
//
// Backoff is exponential (`backoffMs * 2^attempt`) with random jitter added
// on top. Jitter matters: without it, every lambda waiting on a throttled
// upstream wakes up in perfect sync and hammers it again at the same moment.
//
// Caller contract: on total failure we return `null`, NOT throw. Every
// DexScreener / subgraph caller already has a "no data → empty array" path,
// and we want to stay compatible with that. Callers that want the error
// should pass `throwOnFail: true`.
// ─────────────────────────────────────────────────────────────────────────────

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
}

/**
 * Decide whether a response warrants a retry. Retryable classes:
 *   - 5xx: upstream crash / overload
 *   - 429: explicit rate-limit signal
 *   - Anything in `extra`: caller-specific transient codes
 */
function isRetryableStatus(status: number, extra: number[] | undefined): boolean {
  if (status >= 500 && status < 600) return true;
  if (status === 429) return true;
  if (extra && extra.includes(status)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: RetryOpts = {},
): Promise<Response | null> {
  const {
    retries     = 2,
    backoffMs   = 300,
    jitterMs    = 100,
    retryOn,
    throwOnFail = false,
    tag,
  } = opts;

  const logPrefix = tag ? `[fetch-retry ${tag}]` : "[fetch-retry]";
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);

      // Happy path: 2xx/3xx and 4xx-except-429. Return to caller.
      if (!isRetryableStatus(res.status, retryOn)) {
        return res;
      }

      // Transient. If we have more attempts left, fall through to the wait.
      lastError = new Error(`HTTP ${res.status}`);
      if (attempt === retries) {
        // Out of attempts — hand the bad response back so the caller can
        // read the body for debugging if they want. Logging at INFO not
        // ERROR because the caller decides whether this is actually a
        // failure (e.g. DexScreener returning 503 is "no prices today"
        // for us, not a pageable alert).
        console.warn(`${logPrefix} exhausted retries; returning HTTP ${res.status}`);
        return res;
      }
    } catch (err) {
      // Network-level failure (DNS, TCP reset, fetch timeout). Always retryable.
      lastError = err;
      if (attempt === retries) {
        if (throwOnFail) throw err;
        console.warn(`${logPrefix} exhausted retries on network error:`, err);
        return null;
      }
    }

    // Wait before the next attempt. `backoffMs * 2^attempt` doubles each
    // round; jitter keeps synchronised callers from stampeding together.
    const wait = backoffMs * 2 ** attempt + Math.random() * jitterMs;
    await sleep(wait);
  }

  // Unreachable — the loop either returns inside or throws — but TypeScript
  // can't prove that, and defending against "someone tweaked the loop" is cheap.
  if (throwOnFail && lastError) throw lastError;
  return null;
}
