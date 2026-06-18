// Shared pagination footer for the explorer's Schedules + Wallet lists.
// Server component — just renders Prev/Next Links that preserve the current
// filters/sort and change ?page=. Mirrors the inline footer in ExplorerTable
// (the calendar list) so all three modes paginate identically.

import Link from "next/link";

function buildUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer";
}

export function Pagination({
  page, totalPages, total, pageSize, rowsOnPage, params,
}: {
  page:       number;
  totalPages: number;
  total:      number;
  pageSize:   number;
  rowsOnPage: number;
  /** Current URL search params, preserved across page links. */
  params:     Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to   = (page - 1) * pageSize + rowsOnPage;
  const prevHref = page > 1 ? buildUrl({ ...params, page: page - 1 <= 1 ? undefined : String(page - 1) }) : null;
  const nextHref = page < totalPages ? buildUrl({ ...params, page: String(page + 1) }) : null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1.5">
        <PageLink href={prevHref}>‹ Prev</PageLink>
        <span className="text-[11px] px-1" style={{ color: "var(--preview-text-3)" }}>Page {page} of {totalPages.toLocaleString()}</span>
        <PageLink href={nextHref}>Next ›</PageLink>
      </div>
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const base = "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors";
  if (!href) {
    return <span className={base} style={{ color: "var(--preview-text-3)", borderColor: "var(--preview-border)", opacity: 0.5 }}>{children}</span>;
  }
  return (
    <Link href={href} scroll={false} className={`${base} hover:bg-[var(--preview-muted)]`}
      style={{ color: "var(--preview-text-2)", borderColor: "var(--preview-border)" }}>
      {children}
    </Link>
  );
}
