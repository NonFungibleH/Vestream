// src/app/dashboard/explorer/token/[chainId]/[address]/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Suspense skeleton for the explorer token-detail page. The page is server-
// rendered inside the auth-gated (dynamic) dashboard tree and blocks on a
// Promise.all before first paint – getTokenStreams + getTokenMarketData (a
// LIVE DexScreener call) + getSmartMoneyHoldersOfToken (page.tsx:58-62). This
// page is the click-target of nearly every explorer/discover/smart-money row,
// so the blank-during-render gap is high-traffic. The tree-wide
// dashboard/loading.tsx is a generic fallback; this token-shaped skeleton
// makes the swap visually quiet.
//
// Mirrors page.tsx: breadcrumb → header card (symbol + price + save + 5-tile
// stat grid) → "Unlock overview" chart card → "Vesting rounds" list. Style
// matches the sibling ../loading.tsx (--preview-* vars + a `pulse` keyframe).
// ─────────────────────────────────────────────────────────────────────────────

export default function TokenDetailLoading() {
  return (
    <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-7xl overflow-y-auto">
      {/* Breadcrumb */}
      <Bar w="38%" h={11} delay="0s" className="mb-3" />

      {/* Header card */}
      <div className="rounded-2xl border p-5 mb-5" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Bar w={180} h={26} delay="0.05s" className="mb-2" />
            <Bar w={260} h={12} delay="0.1s" />
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <Bar w={36} h={9} delay="0.1s" className="mb-1.5 ml-auto" />
              <Bar w={72} h={18} delay="0.15s" />
            </div>
            {/* Save button area */}
            <div style={{ width: 96, height: 34, borderRadius: 10, background: "var(--preview-muted)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: "0.15s" }} />
          </div>
        </div>

        {/* 5-tile stat grid – Locked value / Total locked / Recipients / Rounds / Next unlock */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
              <Bar w="70%" h={9} delay={`${0.2 + i * 0.04}s`} className="mb-2" />
              <Bar w="55%" h={16} delay={`${0.24 + i * 0.04}s`} />
            </div>
          ))}
        </div>
      </div>

      {/* Unlock overview chart card */}
      <div className="rounded-2xl border p-4 md:p-5 mb-5" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <Bar w={120} h={13} delay="0.4s" className="mb-4" />
        {/* Chart placeholder – a row of bars suggesting an unlock curve. */}
        <div className="flex items-end gap-1.5" style={{ height: 160 }}>
          {[40, 62, 55, 78, 70, 92, 84, 60, 48, 66, 58, 74].map((h, i) => (
            <div key={i} className="flex-1 rounded-t"
              style={{
                height: `${h}%`,
                background: "var(--preview-muted)",
                animation: "pulse 1.6s ease-in-out infinite",
                animationDelay: `${0.45 + i * 0.03}s`,
              }} />
          ))}
        </div>
      </div>

      {/* Vesting rounds */}
      <Bar w={200} h={14} delay="0.5s" className="mb-3" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border overflow-hidden" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "var(--preview-muted)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.55 + i * 0.05}s` }} />
              <div className="flex-1 min-w-0">
                <Bar w="40%" h={13} delay={`${0.55 + i * 0.05}s`} className="mb-2" />
                <Bar w="26%" h={10} delay={`${0.6 + i * 0.05}s`} />
              </div>
              <Bar w={90} h={14} delay={`${0.55 + i * 0.05}s`} />
            </div>
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
  w, h, delay = "0s", className = "",
}: {
  w: string | number;
  h: number;
  delay?: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width:  typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: 6,
        background:   "var(--preview-muted)",
        animation:    "pulse 1.6s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}
