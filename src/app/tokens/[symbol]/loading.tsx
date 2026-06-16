// src/app/tokens/[symbol]/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Skeleton for the public /tokens/[symbol] page. The top 200 symbols are ISR-
// prebuilt, but long-tail symbols cold-render on demand; this gives those
// first hits instant structure instead of a blank gap. Light theme (#F5F5F3)
// to match the page + SiteNav.
// ─────────────────────────────────────────────────────────────────────────────

export default function TokenSymbolLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <div className="h-16" style={{ background: "white", borderBottom: "1px solid rgba(21,23,26,0.08)" }} />
      <section className="px-4 md:px-8 pt-10 md:pt-14 pb-8 max-w-5xl mx-auto w-full">
        <Bar w="35%" h={12} delay="0s" className="mb-5" />
        <Bar w="60%" h={40} delay="0.05s" className="mb-4" />
        <Bar w="80%" h={18} delay="0.1s" />

        {/* 3-up stat strip */}
        <div className="rounded-2xl px-4 py-4 md:px-6 md:py-5 mt-6 grid grid-cols-3 gap-4"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Bar w="55%" h={10} delay={`${0.15 + i * 0.05}s`} className="mb-2" />
              <Bar w="75%" h={24} delay={`${0.2 + i * 0.05}s`} />
            </div>
          ))}
        </div>

        {/* Per-chain cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl p-5" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg" style={{ background: "rgba(21,23,26,0.06)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.25 + i * 0.05}s` }} />
                <Bar w="45%" h={14} delay={`${0.25 + i * 0.05}s`} />
              </div>
              <Bar w="70%" h={11} delay={`${0.3 + i * 0.05}s`} className="mb-2" />
              <Bar w="50%" h={11} delay={`${0.35 + i * 0.05}s`} />
            </div>
          ))}
        </div>
      </section>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 0.85; } }`}</style>
    </div>
  );
}

function Bar({ w, h, delay = "0s", className = "" }: { w: string | number; h: number; delay?: string; className?: string }) {
  return (
    <div className={className} style={{
      width: typeof w === "number" ? `${w}px` : w, height: h, borderRadius: 6,
      background: "rgba(21,23,26,0.06)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: delay,
    }} />
  );
}
