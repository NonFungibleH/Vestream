import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle, getAllArticles, type Block } from "@/lib/articles";
import { linkifyProtocols } from "@/lib/article-linkify";

// Reduce a block list to a single plain-text string for JSON-LD `articleBody`.
// Strips tags, normalises whitespace, caps the length (Google ignores beyond a
// few KB) so we don't bloat the rendered <script> payload.
function blocksToPlainText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "p")        out.push(b.html);
    else if (b.type === "h2" || b.type === "h3") out.push(b.text);
    else if (b.type === "ul" || b.type === "ol") out.push(b.items.join(" "));
    else if (b.type === "callout") out.push(`${b.title}. ${b.body}`);
    else if (b.type === "table") out.push(b.rows.flat().join(" "));
    else if (b.type === "faq")   out.push(b.items.map((x) => `${x.q} ${x.a}`).join(" "));
  }
  return out.join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);
}

// ─── Static params ────────────────────────────────────────────────────────────

export function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} | Vestream`,
    description: article.excerpt,
    keywords: article.tags.join(", "),
    openGraph: {
      title: article.title,
      description: article.excerpt,
      url: `https://vestream.io/resources/${article.slug}`,
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime:  article.updatedAt,
      tags: article.tags,
    },
    twitter: {
      card:        "summary_large_image",
      title:       article.title,
      description: article.excerpt,
    },
  };
}

// ─── Content block renderer ───────────────────────────────────────────────────

function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {

    case "h2":
      return (
        <h2 id={block.text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          className="text-2xl font-bold mt-12 mb-4 scroll-mt-24"
          style={{ color: "#1A1D20" }}>
          {block.text}
        </h2>
      );

    case "h3":
      return (
        <h3 className="text-lg font-bold mt-8 mb-3" style={{ color: "#1A1D20" }}>
          {block.text}
        </h3>
      );

    case "p":
      return (
        <p className="text-base leading-relaxed mb-5" style={{ color: "#334155" }}
          dangerouslySetInnerHTML={{ __html: linkifyProtocols(block.html) }} />
      );

    case "ul":
      return (
        <ul className="mb-5 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-base leading-relaxed" style={{ color: "#334155" }}>
              <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ background: "#1CB8B8", marginTop: "9px" }} />
              <span dangerouslySetInnerHTML={{ __html: linkifyProtocols(item) }} />
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol className="mb-5 space-y-3 counter-reset-list">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-4 text-base leading-relaxed" style={{ color: "#334155" }}>
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white mt-0.5"
                style={{ background: "#1CB8B8", minWidth: "24px" }}>
                {i + 1}
              </span>
              <span dangerouslySetInnerHTML={{ __html: linkifyProtocols(item) }} />
            </li>
          ))}
        </ol>
      );

    case "callout":
      return (
        <div className="my-6 rounded-2xl p-5"
          style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.05), rgba(15,138,138,0.05))", border: "1px solid rgba(28,184,184,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{block.emoji}</span>
            <span className="font-bold text-sm" style={{ color: "#1e40af" }}>{block.title}</span>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#334155" }}>{block.body}</p>
        </div>
      );

    case "table":
      return (
        <div className="my-6 overflow-x-auto rounded-2xl" style={{ border: "1px solid #e2e8f0" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F5F5F3", borderBottom: "1px solid #e2e8f0" }}>
                {block.headers.map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left font-semibold" style={{ color: "#1A1D20" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: ri < block.rows.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-4 py-3" style={{ color: "#334155" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "faq":
      return (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6" style={{ color: "#1A1D20" }}>Frequently Asked Questions</h2>
          <div className="space-y-4">
            {block.items.map((item, i) => (
              <div key={i} className="rounded-2xl p-5"
                style={{ background: "white", border: "1px solid #e2e8f0" }}>
                <h3 className="font-bold mb-2 text-sm" style={{ color: "#1A1D20" }}>{item.q}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ─── Table of contents ────────────────────────────────────────────────────────

function TableOfContents({ blocks }: { blocks: Block[] }) {
  const headings = blocks.filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2");
  if (headings.length < 3) return null;
  return (
    <nav className="rounded-2xl p-4 sm:p-5 mb-8"
      style={{ background: "rgba(28,184,184,0.04)", border: "1px solid rgba(28,184,184,0.12)" }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#1CB8B8" }}>
        In this article
      </p>
      <ol className="space-y-1.5">
        {headings.map((h, i) => (
          <li key={i}>
            <a
              href={`#${h.text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              // break-words prevents long heading anchors from overflowing
              // the rounded TOC card on narrow screens.
              className="text-sm hover:text-blue-600 transition-colors break-words"
              style={{ color: "#475569" }}>
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── Article sidebar ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { dot: string }> = {
  Fundamentals:      { dot: "#3b82f6" },
  Tokenomics:        { dot: "#0F8A8A" },
  Guides:            { dot: "#2DB36A" },
  "Market Analysis": { dot: "#F0992E" },
  Research:          { dot: "#E063A0" },
};

function ArticleSidebar({
  allArticles,
  currentSlug,
}: {
  allArticles: ReturnType<typeof getAllArticles>;
  currentSlug: string;
}) {
  // Group by category
  const categoryOrder: string[] = [];
  const byCategory: Record<string, typeof allArticles> = {};
  for (const a of allArticles) {
    if (!byCategory[a.category]) {
      categoryOrder.push(a.category);
      byCategory[a.category] = [];
    }
    byCategory[a.category].push(a);
  }

  return (
    <aside className="hidden xl:block w-56 flex-shrink-0">
      <div className="sticky top-24 space-y-6">
        {/* Back link */}
        <Link
          href="/resources"
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-blue-600"
          style={{ color: "#8B8E92" }}
        >
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All Resources
        </Link>

        {/* Articles by category */}
        {categoryOrder.map((cat) => {
          const dotColor = CATEGORY_COLORS[cat]?.dot ?? "#8B8E92";
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#B8BABD" }}>
                  {cat}
                </p>
              </div>
              <ul className="space-y-0.5">
                {byCategory[cat].map((a) => {
                  const isCurrent = a.slug === currentSlug;
                  return (
                    <li key={a.slug}>
                      <Link
                        href={`/resources/${a.slug}`}
                        className="block text-xs leading-snug px-2.5 py-1.5 rounded-lg transition-colors"
                        style={{
                          color: isCurrent ? "#1CB8B8" : "#8B8E92",
                          background: isCurrent ? "rgba(28,184,184,0.07)" : "transparent",
                          fontWeight: isCurrent ? 600 : 400,
                        }}
                      >
                        {a.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {/* Mini CTA */}
        <div className="rounded-2xl p-4 text-center" style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(15,138,138,0.06))", border: "1px solid rgba(28,184,184,0.12)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "#1A1D20" }}>Track your unlocks</p>
          <p className="text-[11px] mb-3" style={{ color: "#8B8E92" }}>Free. No signup form.</p>
          <Link
            href="/login"
            className="inline-block text-xs font-bold px-3 py-1.5 rounded-lg text-white w-full text-center transition-all hover:opacity-90"
            style={{ background: "#1CB8B8" }}
          >
            Launch App →
          </Link>
        </div>
      </div>
    </aside>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ArticlePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const allArticles = getAllArticles();
  const relatedArticles = allArticles.filter((a) => a.slug !== slug).slice(0, 4);

  // ── FAQ items for JSON-LD ──────────────────────────────────────────────────
  const faqBlock = article.content.find((b): b is Extract<Block, { type: "faq" }> => b.type === "faq");

  const articleBody = blocksToPlainText(article.content);
  const wordCount   = articleBody ? articleBody.split(/\s+/).length : undefined;

  // 2026-05-17 SEO: graph now includes BreadcrumbList alongside Article +
  // (optional) FAQPage. The visible breadcrumb already lives in the page
  // header but Google's rich-result eligibility checker needs the
  // structured form too — without it Search shows the bare URL in the
  // SERP instead of the "Home › Resources › Tokenomics" trail. Cheap win.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description: article.excerpt,
        articleBody,
        articleSection: article.category,
        inLanguage: "en-US",
        wordCount,
        image: [`https://vestream.io/opengraph-image`],
        datePublished: article.publishedAt,
        dateModified: article.updatedAt,
        author: {
          "@type": "Organization",
          name: "Vestream",
          url: "https://vestream.io",
        },
        publisher: {
          "@type": "Organization",
          name: "Vestream",
          url: "https://vestream.io",
          logo: {
            "@type": "ImageObject",
            url: "https://vestream.io/logo.svg",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://vestream.io/resources/${article.slug}`,
        },
        keywords: article.tags.join(", "),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home",      item: "https://vestream.io" },
          { "@type": "ListItem", position: 2, name: "Resources", item: "https://vestream.io/resources" },
          { "@type": "ListItem", position: 3, name: article.category },
          { "@type": "ListItem", position: 4, name: article.title, item: `https://vestream.io/resources/${article.slug}` },
        ],
      },
      ...(faqBlock
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faqBlock.items.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: item.a,
                },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-16 gap-3"
          style={{ background: "rgba(248,250,252,0.85)", borderBottom: "1px solid rgba(21,23,26,0.10)", backdropFilter: "blur(12px)" }}
        >
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7 flex-shrink-0" />
            <span className="font-bold text-base tracking-tight" style={{ color: "#1A1D20" }}>Vestream</span>
          </Link>
          {/* Mid-nav links hidden on phones — Resources/Pricing are reachable
              via the breadcrumb + footer, and the cramped row was forcing
              the Launch App CTA to overflow on <375px screens. */}
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/resources" className="hidden sm:inline-block text-sm font-semibold transition-colors" style={{ color: "#1A1D20" }}>
              Resources
            </Link>
            <Link href="/pricing" className="hidden sm:inline-block text-sm font-medium transition-colors" style={{ color: "#8B8E92" }}>
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold px-3 sm:px-4 py-1.5 rounded-xl transition-all hover:opacity-90 whitespace-nowrap"
              style={{ background: "#1CB8B8", color: "white", boxShadow: "0 2px 12px rgba(28,184,184,0.3)" }}
            >
              Launch App →
            </Link>
          </div>
        </nav>

        {/* ── Article header ──────────────────────────────────────────────── */}
        <header className="relative overflow-hidden pt-20 md:pt-28 pb-8 md:pb-12 px-4 md:px-6"
          style={{ background: "white", borderBottom: "1px solid #e2e8f0" }}>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          />
          <div className="relative max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm mb-6" style={{ color: "#B8BABD" }}>
              <Link href="/" className="hover:text-slate-600 transition-colors">Home</Link>
              <span>/</span>
              <Link href="/resources" className="hover:text-slate-600 transition-colors">Resources</Link>
              <span>/</span>
              <span style={{ color: "#475569" }}>{article.category}</span>
            </div>

            {/* Category badge */}
            <span
              className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest mb-4"
              style={{ background: "rgba(28,184,184,0.08)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.15)" }}
            >
              {article.category}
            </span>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 leading-tight"
              style={{ color: "#1A1D20" }}>
              {article.title}
            </h1>

            {/* Excerpt */}
            <p className="text-lg leading-relaxed mb-6" style={{ color: "#8B8E92" }}>
              {article.excerpt}
            </p>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: "#B8BABD" }}>
              <span>
                {new Date(article.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </span>
              <span>·</span>
              <span>{article.readingTime}</span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <img src="/logo-icon.svg" alt="Vestream" className="w-4 h-4" />
                Vestream
              </span>
            </div>
          </div>
        </header>

        {/* ── Body: sidebar + article content ─────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-6 py-12 flex gap-10 items-start">

          {/* Left sidebar */}
          <ArticleSidebar allArticles={allArticles} currentSlug={slug} />

          {/* Article content */}
          <main className="flex-1 max-w-3xl min-w-0">

            {/* Table of contents */}
            <TableOfContents blocks={article.content} />

            {/* Content blocks */}
            <article>
              {article.content.map((block, i) => (
                <RenderBlock key={i} block={block} />
              ))}
            </article>

            {/* ── In-article CTA ──────────────────────────────────────────── */}
            <div className="mt-16 rounded-3xl p-8 text-center"
              style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(15,138,138,0.06))", border: "1px solid rgba(28,184,184,0.15)" }}>
              <h2 className="text-xl font-bold mb-2" style={{ color: "#1A1D20" }}>
                Track every token unlock in one dashboard
              </h2>
              <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: "#8B8E92" }}>
                Vestream covers Sablier, Hedgey, Superfluid, LlamaPay, UNCX, Unvest, PinkSale, Streamflow, and Jupiter Lock — across all chains — in a single real-time view. No sign-up forms.
              </p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <Link
                  href="/login"
                  className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90"
                  style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}
                >
                  Launch Dashboard →
                </Link>
                <Link
                  href="/pricing"
                  className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:bg-slate-100"
                  style={{ background: "white", color: "#475569", border: "1px solid #e2e8f0" }}
                >
                  See Pricing
                </Link>
              </div>
            </div>
          </main>
        </div>

        {/* ── More articles ─────────────────────────────────────────────────── */}
        {relatedArticles.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 pb-20">
            <h2 className="text-lg font-bold mb-5" style={{ color: "#1A1D20" }}>More from Vestream Resources</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {relatedArticles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/resources/${a.slug}`}
                  className="group block rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{ background: "white", border: "1px solid #e2e8f0" }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#1CB8B8" }}>
                    {a.category}
                  </span>
                  <h3 className="text-sm font-semibold mt-1 mb-1.5 group-hover:text-blue-600 transition-colors leading-snug"
                    style={{ color: "#1A1D20" }}>
                    {a.title}
                  </h3>
                  <span className="text-xs" style={{ color: "#B8BABD" }}>{a.readingTime}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t py-8 px-6 text-center" style={{ borderColor: "rgba(21,23,26,0.10)" }}>
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <img src="/logo-icon.svg" alt="Vestream" className="w-5 h-5" />
            <span className="font-bold text-sm" style={{ color: "#1A1D20" }}>Vestream</span>
          </div>
          <div className="flex items-center justify-center gap-5 text-sm" style={{ color: "#B8BABD" }}>
            <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms</Link>
            <Link href="/pricing" className="hover:text-slate-600 transition-colors">Pricing</Link>
            <Link href="/resources" className="hover:text-slate-600 transition-colors">Resources</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
