import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticle, getAllArticles, type Block } from "@/lib/articles";

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
          style={{ color: "#0f172a" }}>
          {block.text}
        </h2>
      );

    case "h3":
      return (
        <h3 className="text-lg font-bold mt-8 mb-3" style={{ color: "#0f172a" }}>
          {block.text}
        </h3>
      );

    case "p":
      return (
        <p className="text-base leading-relaxed mb-5" style={{ color: "#334155" }}
          dangerouslySetInnerHTML={{ __html: block.html }} />
      );

    case "ul":
      return (
        <ul className="mb-5 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-base leading-relaxed" style={{ color: "#334155" }}>
              <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", marginTop: "9px" }} />
              <span dangerouslySetInnerHTML={{ __html: item }} />
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
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", minWidth: "24px" }}>
                {i + 1}
              </span>
              <span dangerouslySetInnerHTML={{ __html: item }} />
            </li>
          ))}
        </ol>
      );

    case "callout":
      return (
        <div className="my-6 rounded-2xl p-5"
          style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.05), rgba(124,58,237,0.05))", border: "1px solid rgba(37,99,235,0.15)" }}>
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
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {block.headers.map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left font-semibold" style={{ color: "#0f172a" }}>
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
          <h2 className="text-2xl font-bold mb-6" style={{ color: "#0f172a" }}>Frequently Asked Questions</h2>
          <div className="space-y-4">
            {block.items.map((item, i) => (
              <div key={i} className="rounded-2xl p-5"
                style={{ background: "white", border: "1px solid #e2e8f0" }}>
                <h3 className="font-bold mb-2 text-sm" style={{ color: "#0f172a" }}>{item.q}</h3>
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
    <nav className="rounded-2xl p-5 mb-8"
      style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)" }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#2563eb" }}>
        In this article
      </p>
      <ol className="space-y-1.5">
        {headings.map((h, i) => (
          <li key={i}>
            <a
              href={`#${h.text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              className="text-sm hover:text-blue-600 transition-colors"
              style={{ color: "#475569" }}>
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ArticlePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const allArticles = getAllArticles().filter((a) => a.slug !== slug);

  // ── FAQ items for JSON-LD ──────────────────────────────────────────────────
  const faqBlock = article.content.find((b): b is Extract<Block, { type: "faq" }> => b.type === "faq");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: article.title,
        description: article.excerpt,
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
            url: "https://vestream.io/favicon.ico",
          },
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://vestream.io/resources/${article.slug}`,
        },
        keywords: article.tags.join(", "),
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

      <div className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-16"
          style={{ background: "rgba(248,250,252,0.85)", borderBottom: "1px solid rgba(0,0,0,0.07)", backdropFilter: "blur(12px)" }}
        >
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-base tracking-tight" style={{ color: "#0f172a" }}>Vestream</span>
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/resources" className="text-sm font-medium transition-colors" style={{ color: "#64748b" }}>
              Resources
            </Link>
            <Link href="/pricing" className="text-sm font-medium transition-colors" style={{ color: "#64748b" }}>
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold px-4 py-1.5 rounded-xl transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 2px 12px rgba(37,99,235,0.3)" }}
            >
              Launch App →
            </Link>
          </div>
        </nav>

        {/* ── Article header ──────────────────────────────────────────────── */}
        <header className="relative overflow-hidden pt-28 pb-12 px-6"
          style={{ background: "white", borderBottom: "1px solid #e2e8f0" }}>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)", backgroundSize: "24px 24px" }}
          />
          <div className="relative max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm mb-6" style={{ color: "#94a3b8" }}>
              <Link href="/" className="hover:text-slate-600 transition-colors">Home</Link>
              <span>/</span>
              <Link href="/resources" className="hover:text-slate-600 transition-colors">Resources</Link>
              <span>/</span>
              <span style={{ color: "#475569" }}>{article.category}</span>
            </div>

            {/* Category badge */}
            <span
              className="inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest mb-4"
              style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.15)" }}
            >
              {article.category}
            </span>

            {/* Title */}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 leading-tight"
              style={{ color: "#0f172a" }}>
              {article.title}
            </h1>

            {/* Excerpt */}
            <p className="text-lg leading-relaxed mb-6" style={{ color: "#64748b" }}>
              {article.excerpt}
            </p>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: "#94a3b8" }}>
              <span>
                {new Date(article.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </span>
              <span>·</span>
              <span>{article.readingTime}</span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
                  <span className="text-white font-bold text-[8px]">V</span>
                </div>
                Vestream
              </span>
            </div>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <main className="max-w-3xl mx-auto px-6 py-12">

          {/* Table of contents */}
          <TableOfContents blocks={article.content} />

          {/* Content blocks */}
          <article>
            {article.content.map((block, i) => (
              <RenderBlock key={i} block={block} />
            ))}
          </article>

          {/* ── In-article CTA ────────────────────────────────────────────── */}
          <div className="mt-16 rounded-3xl p-8 text-center"
            style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))", border: "1px solid rgba(37,99,235,0.15)" }}>
            <h2 className="text-xl font-bold mb-2" style={{ color: "#0f172a" }}>
              Track every token unlock in one dashboard
            </h2>
            <p className="text-sm mb-5 max-w-sm mx-auto" style={{ color: "#64748b" }}>
              Vestream covers Sablier, UNCX, Team Finance, Hedgey, and Unvest — across all chains — in a single real-time view. No sign-up forms.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/login"
                className="text-sm font-bold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
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

        {/* ── More articles ────────────────────────────────────────────────── */}
        {allArticles.length > 0 && (
          <section className="max-w-3xl mx-auto px-6 pb-20">
            <h2 className="text-lg font-bold mb-5" style={{ color: "#0f172a" }}>More from Vestream Resources</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {allArticles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/resources/${a.slug}`}
                  className="group block rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{ background: "white", border: "1px solid #e2e8f0" }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#2563eb" }}>
                    {a.category}
                  </span>
                  <h3 className="text-sm font-semibold mt-1 mb-1.5 group-hover:text-blue-600 transition-colors leading-snug"
                    style={{ color: "#0f172a" }}>
                    {a.title}
                  </h3>
                  <span className="text-xs" style={{ color: "#94a3b8" }}>{a.readingTime}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer className="border-t py-8 px-6 text-center" style={{ borderColor: "rgba(0,0,0,0.07)" }}>
          <div className="flex items-center justify-center gap-1.5 mb-3">
            <div className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
              <span className="text-white font-bold text-xs">V</span>
            </div>
            <span className="font-bold text-sm" style={{ color: "#0f172a" }}>Vestream</span>
          </div>
          <div className="flex items-center justify-center gap-5 text-sm" style={{ color: "#94a3b8" }}>
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
