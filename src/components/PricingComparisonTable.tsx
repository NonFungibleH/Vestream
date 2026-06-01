const ROWS: [string, string | boolean, string | boolean][] = [
  ["Wallet addresses",            "3",                  "10"],
  ["Auto-scan all chains",        true,                 true],
  ["All 10+ vesting protocols",   true,                 true],
  ["Real-time mobile app",        true,                 true],
  ["Claimable balance tracking",  true,                 true],
  ["Unlock calendar",             true,                 true],
  ["Push notifications",          "10 / month",         "Unlimited"],
  ["Email alerts",                false,                true],
  ["Live countdowns + reminders", false,                true],
  ["Web dashboard access",        false,                true],
  ["Token Vesting Explorer",      false,                true],
  ["Search any wallet",           false,                true],
  ["Multi-wallet portfolio view", false,                true],
  ["Tax-ready CSV exports",       false,                true],
  ["Vesting income statement",    false,                true],
  ["Year-end PDF tax report",     false,                true],
];

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="#1CB8B8" fillOpacity={0.1} />
      <path d="M5 8l2 2 4-4" stroke="#1CB8B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="8" fill="#B8BABD" fillOpacity={0.08} />
      <path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PricingComparisonTable() {
  return (
    <div
      className="rounded-2xl w-full overflow-hidden"
      aria-label="Tier comparison table"
      role="region"
      style={{
        border: "1px solid rgba(21,23,26,0.10)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      }}
    >
      <div
        className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] px-3 md:px-6 py-4 gap-2"
        style={{ background: "#f1f5f9", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
      >
        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider" style={{ color: "#B8BABD" }}>Feature</span>
        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#B8BABD" }}>Free</span>
        <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#1CB8B8" }}>Pro</span>
      </div>
      {ROWS.map(([feature, free, pro], i) => (
        <div
          key={feature}
          className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] px-3 md:px-6 py-3.5 items-center gap-2"
          style={{
            borderBottom: i < ROWS.length - 1 ? "1px solid rgba(0,0,0,0.05)" : undefined,
            background: i % 2 === 0 ? "white" : "rgba(248,250,252,0.6)",
          }}
        >
          <span className="text-[13px] md:text-sm leading-snug" style={{ color: "#374151" }}>{feature}</span>
          {([free, pro] as (string | boolean)[]).map((val, j) => (
            <div key={j} className="flex justify-center">
              {typeof val === "boolean" ? (
                val ? <CheckIcon /> : <CrossIcon />
              ) : (
                <span
                  className="text-[11px] md:text-xs font-semibold text-center leading-tight"
                  style={{ color: j === 0 ? "#374151" : "#1CB8B8" }}
                >
                  {val}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
