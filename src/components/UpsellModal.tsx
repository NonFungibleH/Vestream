"use client";

// ── Tier definitions ───────────────────────────────────────────────────────────
const TIERS = {
  pro: {
    label:    "Pro",
    gradient: "#1CB8B8",
    accent:   "#1CB8B8",
    features: [
      "Up to 3 wallet addresses",
      "All blockchains (ETH, BSC, Base & more)",
      "All vesting protocols",
      "Email unlock alerts",
      "Advanced analytics",
    ],
  },
  fund: {
    label:    "Fund",
    gradient: "#2D8A4A",
    accent:   "#2D8A4A",
    features: [
      "Everything in Pro",
      "CSV & PDF portfolio exports",
      "iCal calendar integration",
      "Slack & webhook alerts",
      "Team workspace",
      "Unlimited wallet addresses",
    ],
  },
} as const;

type TierKey = keyof typeof TIERS;

// ── Component ──────────────────────────────────────────────────────────────────
export function UpsellModal({
  featureName,
  requiredTier,
  onClose,
}: {
  featureName:  string;
  requiredTier: TierKey;
  onClose:      () => void;
}) {
  const tier = TIERS[requiredTier];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "#fff", boxShadow: "0 32px 80px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Gradient header ── */}
        <div className="px-7 pt-7 pb-6" style={{ background: tier.gradient }}>
          <div className="flex items-start justify-between mb-4">
            <span
              className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}>
              {tier.label} Feature
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full transition-all"
              style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Lock icon + feature name */}
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
              🔒
            </div>
            <div>
              <p className="text-xl font-bold text-white leading-tight">{featureName}</p>
              <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>
                Upgrade to {tier.label} to unlock this
              </p>
            </div>
          </div>
        </div>

        {/* ── Feature list ── */}
        <div className="px-7 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-3.5" style={{ color: "#9ca3af" }}>
            What&apos;s included in {tier.label}
          </p>
          <ul className="space-y-2.5">
            {tier.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                  style={{ stroke: tier.accent, marginTop: 2, flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="text-sm text-gray-700 leading-snug">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── CTA ── */}
        <div className="px-7 pb-7 flex flex-col gap-2.5">
          <a
            href="/pricing"
            className="w-full text-center py-3 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 hover:shadow-lg"
            style={{ background: tier.gradient, boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}>
            Upgrade to {tier.label} →
          </a>
          <button
            onClick={onClose}
            className="w-full text-center py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
