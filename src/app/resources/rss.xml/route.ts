// RSS 2.0 feed for /resources articles. Crypto Twitter has many feed-to-tweet
// bots that pick up new articles automatically — without an RSS endpoint
// we're locked out of that distribution channel.
//
// Format choice: RSS 2.0 (not Atom). Both work, but RSS 2.0 has wider tooling
// support across Twitter bots, podcast aggregators, Slack/Discord webhooks,
// and IFTTT/Zapier triggers. Atom is technically cleaner; RSS is what works.
//
// Cache: revalidates every 6 hours. Articles ship behind `lib/articles.ts`
// (in-source), so a deploy is what propagates new content — feed freshness
// just needs to keep up with deploy cadence, not poll for new content.

import { getAllArticles } from "@/lib/articles";

const SITE = "https://vestream.io";

export const revalidate = 21600; // 6 hours

function escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function articleToRssItem(a: ReturnType<typeof getAllArticles>[0]): string {
  const url = `${SITE}/resources/${a.slug}`;
  // RSS expects RFC-822 dates, e.g. "Tue, 10 Mar 2026 00:00:00 +0000"
  const pubDate = new Date(a.publishedAt).toUTCString();
  const updated = new Date(a.updatedAt).toUTCString();

  return `<item>
  <title>${escape(a.title)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <description>${escape(a.excerpt)}</description>
  <pubDate>${pubDate}</pubDate>
  <atom:updated>${updated}</atom:updated>
  <category>${escape(a.category)}</category>
${a.tags.map((t) => `  <category>${escape(t)}</category>`).join("\n")}
</item>`;
}

export async function GET() {
  const articles = getAllArticles()
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const lastBuildDate = articles[0]?.updatedAt
    ? new Date(articles[0].updatedAt).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Vestream — Token Vesting Resources</title>
  <link>${SITE}/resources</link>
  <atom:link href="${SITE}/resources/rss.xml" rel="self" type="application/rss+xml" />
  <description>Practical guides on token vesting: how schedules work, why cliffs matter, how to spot red flags, and how to track unlocks across every protocol.</description>
  <language>en-us</language>
  <copyright>© ${new Date().getFullYear()} Vestream</copyright>
  <lastBuildDate>${lastBuildDate}</lastBuildDate>
  <generator>Next.js (vestream.io)</generator>
${articles.map(articleToRssItem).join("\n")}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type":  "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
