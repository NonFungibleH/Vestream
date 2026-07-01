// src/app/protocols/[protocol]/unlocks/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Streamed loading skeleton for /protocols/[slug]/unlocks (and the per-chain
// child /unlocks/[chain]). Without this, the page blocked on
// getUnlocksInWindow() – a two-pass scan over the protocol's full active-stream
// set (Sablier alone is ~20k rows) – and on a cold Data Cache miss the user
// saw a BLANK page for up to ~10s before any HTML arrived. (Reported live:
// Sablier upcoming-unlocks showed nothing for ~10s, then snapped in.)
//
// This component renders immediately at navigation time so the user sees the
// page's structure within ~50ms while the real data resolves behind the
// Suspense boundary. Mirrors the production layout (breadcrumb, hero, the
// UNLOCKS/TOKENS/CHAINS/WALLETS stat card, chain-filter pills, list rows) so
// the swap is visually quiet. Modelled on ../loading.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export default function ProtocolUnlocksLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      {/* Mimic SiteNav height so layout doesn't shift when the real header swaps in */}
      <div className="h-16" style={{ background: "white", borderBottom: "1px solid rgba(21,23,26,0.08)" }} />

      <section className="px-4 md:px-8 pt-8 md:pt-12 pb-6 max-w-5xl mx-auto w-full">
        {/* Breadcrumb (Home / Protocols / … / Unlocks) */}
        <Bar w="45%" h={11} delay="0s" className="mb-6" />
        {/* Eyebrow */}
        <Bar w="30%" h={12} delay="0.05s" className="mb-3" />
        {/* Title */}
        <Bar w="75%" h={40} delay="0.1s" className="mb-4" />
        {/* Intro paragraph */}
        <Bar w="90%" h={16} delay="0.15s" className="mb-2" />
        <Bar w="60%" h={16} delay="0.2s" />
      </section>

      {/* Stat card – UNLOCKS / TOKENS / CHAINS / WALLETS in a 2×2 grid */}
      <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto w-full">
        <div className="rounded-2xl p-6"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          <div className="grid grid-cols-2 gap-y-6 gap-x-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <Bar w="60%" h={28} delay={`${0.25 + i * 0.05}s`} className="mb-2" />
                <Bar w="40%" h={11} delay={`${0.3 + i * 0.05}s`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Chain-filter pills */}
      <section className="px-4 md:px-8 pb-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-wrap gap-2">
          {[64, 84, 70, 60, 78, 82].map((w, i) => (
            <div key={i}
              style={{
                width: w, height: 30, borderRadius: 9999,
                background: "rgba(21,23,26,0.06)",
                animation: "pulse 1.6s ease-in-out infinite",
                animationDelay: `${0.45 + i * 0.04}s`,
              }} />
          ))}
        </div>
      </section>

      {/* Unlock list – stub rows */}
      <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto w-full">
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4"
              style={{ borderTop: i > 0 ? "1px solid rgba(0,0,0,0.05)" : undefined }}>
              <div className="w-9 h-9 rounded-lg flex-shrink-0"
                style={{ background: "rgba(21,23,26,0.06)", animation: "pulse 1.6s ease-in-out infinite", animationDelay: `${0.55 + i * 0.05}s` }} />
              <div className="flex-1 min-w-0">
                <Bar w="40%" h={14} delay={`${0.55 + i * 0.05}s`} className="mb-2" />
                <Bar w="28%" h={11} delay={`${0.6 + i * 0.05}s`} />
              </div>
              <Bar w={80} h={16} delay={`${0.55 + i * 0.05}s`} />
            </div>
          ))}
        </div>
      </section>

      {/* Slower custom pulse so the screen feels intentional, not jittery.
          Matches ../loading.tsx. */}
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
