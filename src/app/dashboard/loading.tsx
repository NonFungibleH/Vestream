// src/app/dashboard/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Route-level Suspense fallback for the WHOLE /dashboard/* tree. App Router
// shows this INSTANTLY on navigation to any dashboard tab while that tab's
// server component renders — so clicking e.g. Smart Money no longer freezes
// for 5s with nothing on screen. The server-rendered pages (smart-money,
// explorer, exports) do per-request DB work and the dashboard layout reads
// cookies (which dynamicises the tree), so without this boundary the nav had
// no feedback until the full RSC payload arrived.
//
// Client-driven tabs (the main dashboard, watchlist, alerts) render their own
// SWR skeletons too; this just guarantees an immediate frame on every nav.
//
// Kept deliberately generic + cheap: a header bar + a few shimmer rows that
// echo the common "hero + table" shape. The real page replaces it the moment
// it streams in.
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardLoading() {
  return (
    <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 max-w-6xl w-full" aria-busy="true">
      {/* Heading shimmer */}
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-40 rounded" style={{ background: "var(--preview-muted)" }} />
        <div className="h-8 w-72 rounded-lg" style={{ background: "var(--preview-muted)" }} />
        <div className="h-4 w-full max-w-xl rounded" style={{ background: "var(--preview-muted)" }} />
      </div>

      {/* Stat-strip shimmer */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl border p-4 h-20"
            style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}
          >
            <div className="h-3 w-20 rounded mb-2" style={{ background: "var(--preview-muted)" }} />
            <div className="h-5 w-16 rounded" style={{ background: "var(--preview-muted)" }} />
          </div>
        ))}
      </div>

      {/* Table/list shimmer */}
      <div
        className="rounded-2xl border mt-5 overflow-hidden"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="animate-pulse flex items-center gap-3 px-4 py-3.5"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--preview-border-2)" }}
          >
            <div className="h-8 w-8 rounded-lg flex-shrink-0" style={{ background: "var(--preview-muted)" }} />
            <div className="h-3 flex-1 rounded" style={{ background: "var(--preview-muted)" }} />
            <div className="h-3 w-16 rounded" style={{ background: "var(--preview-muted)" }} />
          </div>
        ))}
      </div>
    </main>
  );
}
