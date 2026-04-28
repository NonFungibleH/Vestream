// src/app/token/[chainId]/[address]/loading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Streamed loading skeleton for /token/[chainId]/[address]. The token detail
// page pulls a 24-month unlock calendar + recipient list + market data, all
// from vestingStreamsCache plus DexScreener price lookups. Cold lambda + 12
// months of bucket aggregation can take 2-4s, during which a blank page
// reads as broken navigation. This component renders instantly so the user
// sees something happening as soon as they click an unlock row.
// ─────────────────────────────────────────────────────────────────────────────

export default function TokenPageLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <div className="h-16" style={{ background: "white", borderBottom: "1px solid rgba(21,23,26,0.08)" }} />

      <section className="px-4 md:px-8 pt-12 md:pt-16 pb-8 max-w-5xl mx-auto w-full">
        <Bar w="35%" h={12} delay="0s" className="mb-6" />
        <Bar w="60%" h={44} delay="0.05s" className="mb-3" />
        <Bar w="40%" h={20} delay="0.1s" />
      </section>

      <section className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl p-5"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              <Bar w="40%" h={11} delay={`${0.15 + i * 0.05}s`} className="mb-3" />
              <Bar w="70%" h={26} delay={`${0.2 + i * 0.05}s`} />
            </div>
          ))}
        </div>
      </section>

      {/* Calendar bars */}
      <section className="px-4 md:px-8 pb-20 max-w-5xl mx-auto w-full">
        <Bar w="25%" h={20} delay="0.3s" className="mb-4" />
        <div className="rounded-2xl p-6"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          <div className="flex items-end gap-2 h-40">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
              <div key={i} style={{
                flex: 1,
                height: `${20 + Math.abs(Math.sin(i * 1.3)) * 70}%`,
                background: "rgba(28,184,184,0.18)",
                borderRadius: 6,
                animation: "pulse 1.6s ease-in-out infinite",
                animationDelay: `${0.35 + i * 0.04}s`,
              }} />
            ))}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}

function Bar({ w, h, delay = "0s", className = "" }: {
  w: string | number; h: number; delay?: string; className?: string;
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
