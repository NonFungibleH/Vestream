// scripts/seo-check.ts
// ─────────────────────────────────────────────────────────────────────────────
// SEO check over the live (or locally served) site. Every URL in both sitemaps
// must return 200, carry a self-referencing canonical, no noindex, a title of
// 60 characters or under and a description of 120–158. A set of impossible
// URLs must return a real 404 (not a 200 with noindex, which Search Console
// files as a soft 404).
//
//   npm run seo:check                                  # production
//   npm run seo:check -- --base http://localhost:3000  # after `next start`
//   npm run seo:check -- --tokens 100                  # sample more token pages
//
// Exits 1 on any error, so it can gate a deploy. Warnings never fail it.
// Origin of every rule: the SEO audit of 2026-10-31 (docs: Vestream SEO Roadmap).
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = arg("base", "https://www.vestream.io").replace(/\/$/, "");
const TOKEN_SAMPLE = Number(arg("tokens", "40"));
const CANONICAL_HOST = "https://www.vestream.io";
const CONCURRENCY = 6;

const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 158;

// Must be a real 404, not a soft one.
const MUST_404 = [
  "/this-page-does-not-exist",
  "/resources/not-a-real-article",
  "/protocols/not-a-protocol",
  "/protocols/not-a-protocol/unlocks",
  "/token/1/0xdeadbeef",
  "/token/999999/0x0000000000000000000000000000000000000000",
];

type Finding = { level: "error" | "warn"; url: string; msg: string };
const findings: Finding[] = [];
const err  = (url: string, msg: string) => findings.push({ level: "error", url, msg });
const warn = (url: string, msg: string) => findings.push({ level: "warn", url, msg });

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// Sitemap URLs are always on the canonical host; when checking a local server,
// fetch the same path from BASE.
const toBase = (url: string) => url.replace(CANONICAL_HOST, BASE);

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  return { status: res.status, text: await res.text() };
}

async function sitemapUrls(path: string): Promise<string[]> {
  const { status, text } = await fetchText(`${BASE}${path}`);
  if (status !== 200) { err(path, `sitemap returned ${status}`); return []; }
  return [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]));
}

function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function checkPage(url: string) {
  let page: { status: number; text: string };
  try { page = await fetchText(toBase(url)); }
  catch (e) { err(url, `fetch failed: ${String(e)}`); return; }

  if (page.status !== 200) { err(url, `status ${page.status} (listed in sitemap)`); return; }
  const h = page.text;

  const canonicals = [...h.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
  if (canonicals.length === 0) err(url, "no canonical");
  else if (canonicals.length > 1) err(url, `${canonicals.length} canonical tags`);
  else if (canonicals[0].replace(/\/$/, "") !== url.replace(/\/$/, "")) err(url, `canonical points at ${canonicals[0]}`);

  const robots = [...h.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1]).join(" ");
  if (/noindex/.test(robots)) err(url, "noindex on a sitemap URL");
  if (h.includes("NEXT_HTTP_ERROR_FALLBACK;404")) err(url, "soft 404 (not-found rendered with 200)");

  const title = decode(h.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
  if (!title) err(url, "no title");
  else if (title.length > TITLE_MAX) warn(url, `title ${title.length} chars: ${title}`);

  const desc = decode(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  if (!desc) err(url, "no meta description");
  else if (desc.length < DESC_MIN || desc.length > DESC_MAX) warn(url, `description ${desc.length} chars`);

  if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) warn(url, "page does not have exactly one h1");
}

async function check404(path: string) {
  try {
    const { status, text } = await fetchText(`${BASE}${path}`);
    if (status === 200 && text.includes("NEXT_HTTP_ERROR_FALLBACK;404")) err(path, "soft 404: not-found page served with 200");
    else if (status !== 404) err(path, `expected 404, got ${status}`);
  } catch (e) { err(path, `fetch failed: ${String(e)}`); }
}

async function pool<T>(items: T[], fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function main() {
  console.log(`SEO check against ${BASE}`);
  const core = await sitemapUrls("/sitemap.xml");
  const tokens = sample(await sitemapUrls("/sitemap-tokens.xml"), TOKEN_SAMPLE);
  const urls = [...core, ...tokens];
  console.log(`${core.length} core URLs, ${tokens.length} sampled token URLs, ${MUST_404.length} 404 probes`);

  await pool(urls, checkPage);
  await pool(MUST_404, check404);

  const errors = findings.filter((f) => f.level === "error");
  const warns  = findings.filter((f) => f.level === "warn");
  for (const f of [...errors, ...warns]) {
    console.log(`${f.level === "error" ? "ERROR" : "warn "}  ${f.url.replace(CANONICAL_HOST, "")}  ${f.msg}`);
  }
  console.log(`\n${errors.length} errors, ${warns.length} warnings across ${urls.length + MUST_404.length} checks`);
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
