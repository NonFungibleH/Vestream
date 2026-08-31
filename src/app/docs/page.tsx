import type { Metadata } from "next";
import Link from "next/link";
import { docsByCategory } from "@/lib/docs";

export const metadata: Metadata = {
  title: "Vestream Docs — how to track token vesting & unlocks",
  description:
    "The complete Vestream guide: track wallets, set up unlock notifications, use the Explorer and tax reports, and see every integrated protocol and chain.",
  alternates: { canonical: "https://www.vestream.io/docs" },
  openGraph: {
    title: "Vestream Docs",
    description: "How to track token vesting and unlocks with Vestream — every feature, explained.",
    url: "https://www.vestream.io/docs",
    siteName: "Vestream",
    type: "website",
  },
};

export default function DocsOverviewPage() {
  const groups = docsByCategory();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.vestream.io" },
      { "@type": "ListItem", position: 2, name: "Docs", item: "https://www.vestream.io/docs" },
    ],
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#2563eb" }}>Documentation</p>
      <h1 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: "#0f172a", letterSpacing: "-0.03em" }}>
        Vestream Docs
      </h1>
      <p className="text-lg leading-relaxed mb-10 max-w-2xl" style={{ color: "#334155" }}>
        Everything Vestream can do — how to track wallets, set up unlock alerts, use the Explorer and
        tax tools, and the full list of protocols and chains we index. New here? Start with{" "}
        <Link href="/docs/getting-started" style={{ color: "#2563eb", fontWeight: 600 }} className="hover:underline">Getting started</Link>.
      </p>

      {groups.map((g) => (
        <section key={g.category} className="mb-10">
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: "#94a3b8" }}>{g.category}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {g.pages.map((p) => (
              <Link key={p.slug} href={`/docs/${p.slug}`}
                className="block p-5 rounded-2xl transition-colors"
                style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none flex-shrink-0">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-[15px] mb-0.5" style={{ color: "#0f172a" }}>{p.title.replace(/ — .*$/, "")}</p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "#64748b" }}>{p.summary}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
