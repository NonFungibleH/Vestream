import Link from "next/link";
import type { Metadata } from "next";
import { getAllArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Resources – Token Vesting Guides & Insights | Vestream",
  description:
    "In-depth guides on token vesting schedules, cliff periods, unlock tracking, and tokenomics. Written for investors, project teams, and Web3 professionals.",
  openGraph: {
    title: "Resources – Token Vesting Guides & Insights | Vestream",
    description:
      "In-depth guides on token vesting schedules, cliff periods, unlock tracking, and tokenomics.",
    url: "https://vestream.io/resources",
    type: "website",
  },
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Fundamentals:      { bg: "rgba(59,130,246,0.10)",  text: "#60a5fa", dot: "#3b82f6" },
  Tokenomics:        { bg: "rgba(167,139,250,0.12)", text: "#a78bfa", dot: "#7c3aed" },
  Guides:            { bg: "rgba(52,211,153,0.10)",  text: "#34d399", dot: "#10b981" },
  "Market Analysis": { bg: "rgba(251,146,60,0.12)",  text: "#fb923c", dot: "#f97316" },
  Research:          { bg: "rgba(244,114,182,0.12)", text: "#f472b6", dot: "#ec4899" },
};

export default function ResourcesPage() {
  const articles = getAllArticles();

  // Group articles by category, preserving first-seen order
  const categoryOrder: string[] = [];
  const byCategory: Record<string, typeof articles> = {};
  for (const article of articles) {
    if (!byCategory[article.category]) {
      categoryOrder.push(article.category);
      byCategory[article.category] = [];
    }
    byCategory[article.category].push(article);
  }

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
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
          <Link href="/resources" className="text-sm font-semibold transition-colors" style={{ color: "#0f172a" }}>
            Resources
          </Link>
          <Link href="/pricing" className="text-sm font-medium transition-colors" style={{ color: "#64748b" }}>
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold px-4 py-1.5 rounded-xl transition-all duration-150 hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 2px 12px rgba(37,99,235,0.3)" }}
          >
            Launch App →
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-16 px-6 text-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.05) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(37,99,235,0.06) 0%, transparent 65%)" }}
        />
        <div className="relative">
          <span
            className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-5 tracking-widest uppercase"
            style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.15)" }}
          >
            Resources
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 max-w-2xl mx-auto leading-tight">
            Everything you need to know about{" "}
            <span style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              token vesting
            </span>
          </h1>
          <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: "#64748b" }}>
            In-depth guides for investors, project teams, and Web3 professionals — covering vesting schedules, unlock tracking, tokenomics, and more.
          </p>
        </div>
      </section>

      {/* ── Body: sidebar + article sections ──────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 pb-24 flex gap-10 items-start">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-7">

            {/* Categories */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>
                Browse by category
              </p>
              <ul className="space-y-0.5">
                {categoryOrder.map((cat) => {
                  const style = CATEGORY_COLORS[cat] ?? { bg: "rgba(100,116,139,0.1)", text: "#64748b", dot: "#64748b" };
                  const anchor = cat.toLowerCase().replace(/\s+/g, "-");
                  return (
                    <li key={cat}>
                      <a
                        href={`#${anchor}`}
                        className="flex items-center justify-between gap-2 text-sm px-2.5 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
                        style={{ color: "#475569" }}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: style.dot }} />
                          {cat}
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: "#94a3b8" }}>
                          {byCategory[cat].length}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* All articles */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>
                All articles
              </p>
              <ul className="space-y-0.5">
                {articles.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/resources/${a.slug}`}
                      className="block text-xs leading-snug px-2.5 py-1.5 rounded-lg transition-colors hover:bg-slate-100"
                      style={{ color: "#64748b" }}
                    >
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Mini CTA */}
            <div className="rounded-2xl p-4 text-center" style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))", border: "1px solid rgba(37,99,235,0.12)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "#0f172a" }}>Track your unlocks</p>
              <p className="text-[11px] mb-3" style={{ color: "#64748b" }}>Free dashboard. No signup form.</p>
              <Link
                href="/login"
                className="inline-block text-xs font-bold px-3 py-1.5 rounded-lg text-white w-full text-center transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
              >
                Launch App →
              </Link>
            </div>

          </div>
        </aside>

        {/* ── Article grid grouped by category ──────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-14">
          {categoryOrder.map((cat) => {
            const catStyle = CATEGORY_COLORS[cat] ?? { bg: "rgba(100,116,139,0.1)", text: "#64748b", dot: "#64748b" };
            const anchor = cat.toLowerCase().replace(/\s+/g, "-");
            return (
              <section key={cat} id={anchor} className="scroll-mt-24">
                {/* Category header */}
                <div className="flex items-center gap-3 mb-6">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest"
                    style={{ background: catStyle.bg, color: catStyle.text }}
                  >
                    {cat}
                  </span>
                  <span className="text-xs" style={{ color: "#94a3b8" }}>
                    {byCategory[cat].length} {byCategory[cat].length === 1 ? "article" : "articles"}
                  </span>
                </div>

                {/* Article cards */}
                <div className="grid gap-5 sm:grid-cols-2">
                  {byCategory[cat].map((article) => (
                    <Link
                      key={article.slug}
                      href={`/resources/${article.slug}`}
                      className="group block rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
                      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}
                    >
                      {/* Card accent */}
                      <div className="h-1.5" style={{ background: "linear-gradient(90deg, #2563eb, #7c3aed)" }} />

                      <div className="p-6">
                        {/* Reading time */}
                        <div className="flex items-center justify-end mb-3">
                          <span className="text-[11px]" style={{ color: "#94a3b8" }}>{article.readingTime}</span>
                        </div>

                        {/* Title */}
                        <h2
                          className="text-base font-bold leading-snug mb-3 group-hover:text-blue-600 transition-colors"
                          style={{ color: "#0f172a" }}
                        >
                          {article.title}
                        </h2>

                        {/* Excerpt */}
                        <p className="text-sm leading-relaxed mb-4 line-clamp-3" style={{ color: "#64748b" }}>
                          {article.excerpt}
                        </p>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5 mb-5">
                          {article.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-2 py-0.5 rounded-full"
                              style={{ background: "#f1f5f9", color: "#64748b" }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid #f1f5f9" }}>
                          <span className="text-[11px]" style={{ color: "#94a3b8" }}>
                            {new Date(article.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: "#2563eb" }}>
                            Read →
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* ── CTA banner ────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div
          className="rounded-3xl p-10 text-center"
          style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))", border: "1px solid rgba(37,99,235,0.12)" }}
        >
          <h2 className="text-2xl font-bold mb-3" style={{ color: "#0f172a" }}>
            Track your token vestings in one place
          </h2>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "#64748b" }}>
            Vestream connects to all major vesting protocols across every supported chain — so you never miss an unlock.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm font-bold px-6 py-3 rounded-xl text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 20px rgba(37,99,235,0.3)" }}
          >
            Launch Dashboard →
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
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
  );
}
