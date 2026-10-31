// src/lib/author.ts
// ─────────────────────────────────────────────────────────────────────────────
// The named author on articles. A real person with a profile beats an
// organisation byline for search and AI-answer trust (SEO roadmap, Phase 1).
// One definition so the visible byline, the <meta name="author"> and the
// Article schema never disagree.
// ─────────────────────────────────────────────────────────────────────────────

export const ARTICLE_AUTHOR = {
  name: "Non Fungible Howard",
  url:  "https://x.com/NFHoward",
} as const;

export const ARTICLE_AUTHOR_JSONLD = {
  "@type":  "Person",
  name:     ARTICLE_AUTHOR.name,
  url:      ARTICLE_AUTHOR.url,
  sameAs:   [ARTICLE_AUTHOR.url],
  worksFor: { "@type": "Organization", name: "Vestream", url: "https://www.vestream.io" },
} as const;
