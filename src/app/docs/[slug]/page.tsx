import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOC_PAGES, DOC_SLUGS, getDocPage } from "@/lib/docs";
import { DocsBody } from "../_components/DocsBody";

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) return { title: "Not found · Vestream Docs" };
  const url = `https://www.vestream.io/docs/${slug}`;
  return {
    title: `${page.title} · Vestream Docs`,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url, siteName: "Vestream", type: "article" },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getDocPage(slug);
  if (!page) notFound();

  const idx = DOC_PAGES.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? DOC_PAGES[idx - 1] : null;
  const next = idx < DOC_PAGES.length - 1 ? DOC_PAGES[idx + 1] : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.vestream.io" },
      { "@type": "ListItem", position: 2, name: "Docs", item: "https://www.vestream.io/docs" },
      { "@type": "ListItem", position: 3, name: page.title, item: `https://www.vestream.io/docs/${slug}` },
    ],
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-xs" style={{ color: "#94a3b8" }}>
          <li><Link href="/" style={{ color: "#64748b" }}>Home</Link></li>
          <li aria-hidden>/</li>
          <li><Link href="/docs" style={{ color: "#64748b" }}>Docs</Link></li>
          <li aria-hidden>/</li>
          <li aria-current="page" style={{ color: "#0f172a", fontWeight: 600 }}>{page.category}</li>
        </ol>
      </nav>

      <h1 className="text-3xl md:text-4xl font-bold mb-6" style={{ color: "#0f172a", letterSpacing: "-0.03em" }}>
        {page.title}
      </h1>

      <DocsBody blocks={page.body} />

      {/* Prev / next */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-12 pt-8" style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="p-4 rounded-xl" style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>
            <p className="text-xs mb-1" style={{ color: "#94a3b8" }}>← Previous</p>
            <p className="text-sm font-semibold" style={{ color: "#0f172a" }}>{prev.title}</p>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/docs/${next.slug}`} className="p-4 rounded-xl sm:text-right" style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>
            <p className="text-xs mb-1" style={{ color: "#94a3b8" }}>Next →</p>
            <p className="text-sm font-semibold" style={{ color: "#0f172a" }}>{next.title}</p>
          </Link>
        ) : <span />}
      </div>
    </article>
  );
}
