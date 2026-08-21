// src/lib/indexnow.ts
// ─────────────────────────────────────────────────────────────────────────────
// IndexNow — instantly notify Bing (and Yandex, DuckDuckGo, etc.) when our
// content changes, instead of waiting for them to re-crawl. Bing Webmaster
// Tools flags "Learn how IndexNow boosts site visibility" as a HIGH-priority
// recommendation, and because Bing's index feeds Copilot / ChatGPT search /
// DuckDuckGo, fast IndexNow submission is also the cheapest "GEO" (AI-search)
// win available.
//
// Ownership is proven by the public key file at KEY_LOCATION (the key's own
// value is the file contents). Submitting is a single POST with the URL list.
// ─────────────────────────────────────────────────────────────────────────────

// Public ownership token — NOT a secret (it's served at KEY_LOCATION on purpose).
export const INDEXNOW_KEY = "905824b268e89ef70337a66c4626f6e1";
const HOST         = "www.vestream.io";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;

/**
 * Submit a batch of absolute or root-relative URLs to IndexNow. Best-effort:
 * failures are logged, never thrown (search-engine notification must never
 * affect the caller). IndexNow accepts up to 10,000 URLs per request.
 */
export async function submitToIndexNow(urls: string[]): Promise<void> {
  const urlList = Array.from(new Set(
    urls
      .map((u) => (u.startsWith("http") ? u : `https://${HOST}${u.startsWith("/") ? "" : "/"}${u}`))
      .filter((u) => u.startsWith(`https://${HOST}/`)),
  )).slice(0, 10_000);
  if (urlList.length === 0) return;

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method:  "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body:    JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList }),
    });
    // 200 = accepted, 202 = accepted (validation pending). Anything else, log.
    if (res.status !== 200 && res.status !== 202) {
      console.warn(`[indexnow] submit returned ${res.status} for ${urlList.length} URLs`);
    } else {
      console.log(`[indexnow] submitted ${urlList.length} URLs (status ${res.status})`);
    }
  } catch (err) {
    console.warn("[indexnow] submit failed (non-fatal):", err);
  }
}
