// src/app/dashboard/explorer/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Suspense skeleton for the Vesting Explorer. The page is force-dynamic and
// does heavy blocking work on every render – a 2000-row window scan, a LIVE
// DexScreener price batch, and the wallet/round count aggregate – so each
// navigation/filter/sort previously left the screen frozen for seconds with
// no feedback. This renders instantly while that work runs.
//
// (The deeper fix for sort latency is to make sorting client-side so it
// doesn't round-trip the server at all – tracked separately.)
// ─────────────────────────────────────────────────────────────────────────────

export default function ExplorerLoading() {
  return (
    <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 max-w-6xl w-full">
      {/* Search bar */}
      <Bar w="100%" h={48} delay="0s" className="mb-5" rounded={14} />

      {/* Filter pills row */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[78, 64, 70, 60, 88, 56].map((w, i) => (
          <div key={i}
            style={{
              width: w, height: 30, borderRadius: 9999,
              background: "var(--preview-muted)",
              animation: "pulse 1.6s ease-in-out infinite",
              animationDelay: `${0.05 + i * 0.04}s`,
            }} />
        ))}
      </div>

      {/* Match count line */}
      <Bar w={120} h={12} delay="0.25s" className="mb-3" />

      {/* Results table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {/* Header row */}
        <div className="flex items-center px-4 md:px-5 py-2.5"
          style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}>
          {["28%", "16%", "14%", "12%", "16%"].map((w, i) => (
            <div key={i} style={{ width: w }}>
              <Bar w="60%" h={9} delay={`${0.3 + i * 0.03}s`} />
            </div>
          ))}
        </div>
        {/* Stub rows */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 md:px-5 py-3"
            style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
            <div className="w-8 h-8 rounded-lg flex-shrink-0"
              style={{ background: "var(--preview-muted)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.35 + i * 0.04}s` }} />
            <div className="flex-1 min-w-0">
              <Bar w="42%" h={13} delay={`${0.35 + i * 0.04}s`} className="mb-2" />
              <Bar w="58%" h={10} delay={`${0.4 + i * 0.04}s`} />
            </div>
            <Bar w={56} h={14} delay={`${0.35 + i * 0.04}s`} />
            <Bar w={40} h={14} delay={`${0.4 + i * 0.04}s`} />
            <Bar w={52} h={14} delay={`${0.45 + i * 0.04}s`} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 0.85; }
        }
      `}</style>
    </main>
  );
}

function Bar({
  w, h, delay = "0s", className = "", rounded = 6,
}: {
  w: string | number;
  h: number;
  delay?: string;
  className?: string;
  rounded?: number;
}) {
  return (
    <div
      className={className}
      style={{
        width:  typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: rounded,
        background:   "var(--preview-muted)",
        animation:    "pulse 1.6s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}
