// src/components/WebPageJsonLd.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Minimal schema.org markup for marketing pages that had none (/invest,
// /payroll, /corporate/token-payroll, /demo, /developer, /ai, /early-access,
// /unlocks/report — SEO audit 2026-10-31). Declares the page and ties it to
// the site entity the homepage defines (`#website`), so search engines and AI
// crawlers read each page as part of Vestream rather than a loose URL.
// ─────────────────────────────────────────────────────────────────────────────

const SITE = "https://www.vestream.io";

interface Props {
  path:        string;
  name:        string;
  description: string;
  /** CollectionPage for hubs/archives; WebPage otherwise. */
  type?:       "WebPage" | "CollectionPage";
  /** What the page is about, e.g. "Crypto payroll". */
  about?:      string;
}

export function WebPageJsonLd({ path, name, description, type = "WebPage", about }: Props) {
  const url = `${SITE}${path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type":    type,
    "@id":      `${url}#page`,
    url,
    name,
    description,
    isPartOf:   { "@id": `${SITE}/#website` },
    publisher:  { "@type": "Organization", name: "Vestream", url: SITE },
    ...(about ? { about: { "@type": "Thing", name: about } } : {}),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
