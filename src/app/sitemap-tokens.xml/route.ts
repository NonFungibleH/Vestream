// src/app/sitemap-tokens.xml/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// TOKENS sitemap — the high-volume programmatic /token/{chainId}/{address}
// pages, split out of the core /sitemap.xml (Aug 2026) so crawl budget stays
// concentrated on the human-authored core surface and GSC can report indexing
// rates per section. Both sitemaps are advertised in robots.txt.
//
// Fetch resilience mirrors the old inline sitemap logic: bounded single-shot at
// build (no reliable DB — must never hang the deploy), retry + last-good cache
// at runtime. lastmod is date-only (stable within a day) — token vesting math
// advances daily, and a render-time timestamp made Google distrust the signal.
// ─────────────────────────────────────────────────────────────────────────────

import { getTopTokens } from "@/lib/vesting/token-symbols";
import { readSitemapTokensCache } from "@/lib/sitemap-token-cache";
import { withTimeout } from "@/lib/with-timeout";

const SITE = "https://www.vestream.io";

// 10-min ISR: the token list returns empty during build (no DB), so a short
// window lets the first runtime hit repopulate the real URLs quickly.
export const revalidate = 600;

type TokenRow = { chainId: number; address: string };

// Retry before giving up — the failure that emptied the sitemap in the past was
// a transient pooler blip at ISR-regen time. Retries on both a throw and an
// empty result (the site always has thousands of tokens, so empty === failure).
async function fetchTokenListWithRetry(
  fn: () => Promise<TokenRow[]>,
  label: string,
  attempts = 3,
): Promise<TokenRow[]> {
  let last: TokenRow[] = [];
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fn();
      if (r.length > 0) return r;
      last = r;
      console.warn(`[sitemap-tokens] ${label} returned 0 rows (attempt ${i + 1}/${attempts})`);
    } catch (err) {
      console.error(`[sitemap-tokens] ${label} threw (attempt ${i + 1}/${attempts}):`, err);
    }
    if (i < attempts - 1) await new Promise((res) => setTimeout(res, 600 * (i + 1)));
  }
  return last;
}

// URL path segments are token addresses (EVM hex / Solana base58) — no XML
// metacharacters — but escape defensively in case an odd cached value slips in.
function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const today = new Date().toISOString().slice(0, 10); // date-only, stable per day

  let topTokens: TokenRow[] = [];
  if (isBuild) {
    topTokens = await withTimeout<TokenRow[]>(
      getTopTokens(1500).catch(() => []),
      15_000,
      [],
      "sitemap-tokens-build",
    );
  } else {
    topTokens = await fetchTokenListWithRetry(() => getTopTokens(1500), "getTopTokens");
    if (topTokens.length === 0) {
      topTokens = await readSitemapTokensCache();
      if (topTokens.length > 0) console.warn("[sitemap-tokens] getTopTokens empty, served last-good cache");
    }
  }

  const urls = topTokens
    .map(
      (t) =>
        `  <url>\n    <loc>${SITE}/token/${t.chainId}/${escapeXml(t.address)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.65</priority>\n  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type":  "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
