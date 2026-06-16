// src/app/status/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Skeleton for /status. The page is force-dynamic and awaits 4 parallel DB
// reads (maxDuration 30) before paint, so without this it showed a blank
// screen for 1–3s. Operator-facing + noindex, but the skeleton removes the
// only blank-render path among public routes. Light theme (#f8fafc) + SiteNav.
// ─────────────────────────────────────────────────────────────────────────────

export default function StatusLoading() {
  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <div className="h-16" style={{ background: "white", borderBottom: "1px solid rgba(0,0,0,0.07)" }} />
      <section className="px-4 md:px-8 pt-10 pb-8 max-w-5xl mx-auto w-full">
        <Bar w="40%" h={32} delay="0s" className="mb-3" />
        <Bar w="65%" h={16} delay="0.05s" className="mb-8" />

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-5" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}>
              <Bar w="55%" h={11} delay={`${0.1 + i * 0.05}s`} className="mb-3" />
              <Bar w="70%" h={26} delay={`${0.15 + i * 0.05}s`} />
            </div>
          ))}
        </div>

        {/* Status grid / table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5"
              style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "rgba(0,0,0,0.06)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.2 + i * 0.05}s` }} />
              <Bar w="30%" h={13} delay={`${0.2 + i * 0.05}s`} />
              <div className="flex-1" />
              <Bar w={70} h={13} delay={`${0.25 + i * 0.05}s`} />
            </div>
          ))}
        </div>
      </section>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }`}</style>
    </div>
  );
}

function Bar({ w, h, delay = "0s", className = "" }: { w: string | number; h: number; delay?: string; className?: string }) {
  return (
    <div className={className} style={{
      width: typeof w === "number" ? `${w}px` : w, height: h, borderRadius: 6,
      background: "rgba(0,0,0,0.06)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: delay,
    }} />
  );
}
