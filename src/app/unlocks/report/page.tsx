// /unlocks/report — hub / archive for the dated Monthly Token Unlock Reports.
// Lists recent + upcoming months so each dated report accrues internal links
// and crawlers can discover the whole archive from one page.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { monthLabel } from "@/lib/vesting/monthly-report";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Token Unlock Reports, Monthly Archive | Vestream",
  description:
    "Monthly token unlock reports: the biggest scheduled unlocks each month across every protocol and chain, ranked by USD value. Updated from live vesting data.",
  alternates: { canonical: "https://www.vestream.io/unlocks/report" },
  openGraph: {
    title: "Token Unlock Reports, Monthly Archive",
    description: "The biggest token unlocks each month, ranked by USD value across every protocol and chain.",
    url: "https://www.vestream.io/unlocks/report",
    siteName: "Vestream",
    type: "website",
  },
};

// Show the last 3 months + current + next 6 — the window people actually link to
// and search for ("upcoming token unlocks"). Purely date math, no DB.
function reportMonths(): { slug: string; label: string; upcoming: boolean }[] {
  const now = new Date();
  const out: { slug: string; label: string; upcoming: boolean }[] = [];
  for (let offset = 6; offset >= -3; offset--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    out.push({ slug: `${y}-${String(m).padStart(2, "0")}`, label: monthLabel(y, m), upcoming: offset >= 0 });
  }
  return out;
}

export default function ReportHubPage() {
  const months = reportMonths();
  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-8 max-w-4xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: "#B8BABD" }}>
            <li><Link href="/" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/unlocks" style={{ color: "#8B8E92" }}>Unlocks</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>Reports</li>
          </ol>
        </nav>
        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>Token unlock reports</p>
        <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          Monthly Token Unlock Reports
        </h1>
        <p className="text-base max-w-2xl leading-relaxed mb-8" style={{ color: "#475569" }}>
          The biggest scheduled token unlocks each month, ranked by USD value across every protocol and chain Vestream tracks. Built from live vesting-schedule data.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {months.map((mo) => (
            <Link
              key={mo.slug}
              href={`/unlocks/report/${mo.slug}`}
              className="rounded-xl px-4 py-4 transition-colors hover:brightness-[0.98]"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}
            >
              <p className="font-semibold text-sm" style={{ color: "#1A1D20" }}>{mo.label}</p>
              <p className="text-xs mt-0.5" style={{ color: mo.upcoming ? "#0F8A8A" : "#B8BABD" }}>
                {mo.upcoming ? "Upcoming unlocks →" : "Report →"}
              </p>
            </Link>
          ))}
        </div>

        <p className="text-sm mt-8" style={{ color: "#8B8E92" }}>
          Prefer a live view? See the{" "}
          <Link href="/unlocks" style={{ color: "#0F8A8A", fontWeight: 600 }}>token unlock calendar</Link> or{" "}
          <Link href="/resources/what-is-token-vesting" style={{ color: "#0F8A8A", fontWeight: 600 }}>the complete guide to token vesting</Link>.
        </p>
      </section>
      <SiteFooter theme="light" />
    </div>
  );
}
