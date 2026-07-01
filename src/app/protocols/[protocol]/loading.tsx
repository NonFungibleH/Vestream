// src/app/protocols/[protocol]/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Streamed loading skeleton for /protocols/[slug]. Without this, Next clicks
// on /protocols cards felt broken on cold lambdas – the protocol page is
// `force-dynamic` and pulls 4 parallel DB queries (stats, latest, next,
// upcoming list) plus a price batch. Cold lambda + cold cache = ~1-3s of
// blank-page hang before HTML arrives.
//
// This component renders immediately at navigation time so users see
// something happening within ~50ms. The page swaps in once the real data
// resolves. Mirrors the production layout (hero, stat strip, upcoming
// list) so the swap is visually quiet.
// ─────────────────────────────────────────────────────────────────────────────

export default function ProtocolPageLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      {/* Mimic SiteNav height so layout doesn't shift when real header swaps in */}
      <div className="h-16" style={{ background: "white", borderBottom: "1px solid rgba(21,23,26,0.08)" }} />

      {/* Hero block */}
      <section className="px-4 md:px-8 pt-12 md:pt-16 pb-8 max-w-5xl mx-auto w-full">
        <Bar w="40%" h={12} delay="0s" className="mb-6" />
        <Bar w="80%" h={48} delay="0.05s" className="mb-4" />
        <Bar w="60%" h={48} delay="0.1s" className="mb-8" />
        <Bar w="70%" h={20} delay="0.15s" />
      </section>

      {/* Stat strip */}
      <section className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl p-5"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              <Bar w="50%" h={11} delay={`${0.2 + i * 0.05}s`} className="mb-3" />
              <Bar w="80%" h={28} delay={`${0.25 + i * 0.05}s`} />
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming unlocks list – 4 stub rows */}
      <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto w-full">
        <Bar w="30%" h={20} delay="0.4s" className="mb-4" />
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4"
              style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}>
              <div className="w-8 h-8 rounded-lg flex-shrink-0"
                style={{ background: "rgba(21,23,26,0.06)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.45 + i * 0.05}s` }} />
              <div className="flex-1 min-w-0">
                <Bar w="45%" h={14} delay={`${0.45 + i * 0.05}s`} className="mb-2" />
                <Bar w="30%" h={11} delay={`${0.5 + i * 0.05}s`} />
              </div>
              <Bar w={70} h={14} delay={`${0.45 + i * 0.05}s`} />
            </div>
          ))}
        </div>
      </section>

      {/* Tailwind has built-in `animate-pulse` but we prefer this slower
          custom pulse so the screen feels intentional, not jittery. */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 0.85; }
        }
      `}</style>
    </div>
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
        background:   "rgba(21,23,26,0.06)",
        animation:    "pulse 1.6s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}
