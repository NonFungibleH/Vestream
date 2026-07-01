"use client";

// src/components/WalletChip.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Account chip + dropdown for the dashboard header – shows the signed-in
// identity (email or wallet address) and a Sign out action. Extracted from
// the home page so the now-universal <DashboardHeader> (rendered once by
// DashboardChrome) can own it across every dashboard tab.
// ─────────────────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletChip({ address, open, onToggle, onDisconnect }: {
  address: string; open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDisconnect: () => void;
}) {
  const isEmail  = address.includes("@");
  const initials = isEmail
    ? address.slice(0, 2).toUpperCase()
    : address.slice(2, 4).toUpperCase();
  const displayLabel = isEmail
    ? (address.length > 16 ? address.slice(0, 14) + "…" : address)
    : shortAddr(address);

  return (
    <div className="relative">
      <button onClick={onToggle}
        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl border transition-all duration-150"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--preview-card)")}
      >
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{initials}</div>
        <span className="text-xs font-medium" style={{ color: "var(--preview-text-2)", fontFamily: isEmail ? "inherit" : "monospace" }}>{displayLabel}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
          <path d={open ? "M2 6.5L5 3.5L8 6.5" : "M2 3.5L5 6.5L8 3.5"}
            stroke="var(--preview-text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-2xl border z-50 p-1 overflow-hidden"
          style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(21,23,26,0.10)" }}>
          <div className="px-3 py-3 mb-1" style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-white">{initials}</div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>{isEmail ? "Email account" : "My Wallet"}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-emerald-500 font-medium">Signed in</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] break-all" style={{ color: "var(--preview-text-3)", fontFamily: isEmail ? "inherit" : "monospace" }}>{address}</p>
          </div>
          <button onClick={onDisconnect}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 transition-colors font-semibold">
            <span>⊘</span> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
