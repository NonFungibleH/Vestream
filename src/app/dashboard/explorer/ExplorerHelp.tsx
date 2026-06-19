"use client";

// "?" help popover for the Vesting Explorer. Auto-opens once on a user's first
// visit (localStorage flag), then is reopenable any time via the button. A
// quick tour of the tabs, lenses, filters, and columns for newcomers.

import { useEffect, useState } from "react";

const SEEN_KEY = "vestr_explorer_help_v1";

export function ExplorerHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { if (!localStorage.getItem(SEEN_KEY)) setOpen(true); } catch { /* SSR / blocked storage */ }
  }, []);

  function close() {
    setOpen(false);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How the explorer works"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors"
        style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={close}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl p-5 md:p-6"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold" style={{ color: "var(--preview-text)" }}>How the Vesting Explorer works</h2>
              <button onClick={close} aria-label="Close" className="text-lg leading-none px-1" style={{ color: "var(--preview-text-3)" }}>✕</button>
            </div>

            <p className="text-sm mb-4" style={{ color: "var(--preview-text-2)" }}>
              Search every vesting position we index across all supported protocols and chains. Three lenses on the same data:
            </p>

            <Section title="The three tabs">
              <Item k="Upcoming">one row per <b>token</b> (all its wallets + schedules rolled up), sorted by next unlock. Use this to find projects.</Item>
              <Item k="Schedules">one row per <b>individual vesting position</b> — the raw per-wallet streams.</Item>
              <Item k="Wallet">every vesting position held by <b>one recipient</b> (paste an address or ENS in the search box).</Item>
            </Section>

            <Section title="Quick lenses">
              One-click curated views: <b>Imminent cliffs</b>, <b>Whale-controlled</b>, <b>Fair launches</b>, <b>Almost done</b>, <b>Biggest overhang</b>. Each replaces your filters with a useful preset.
            </Section>

            <Section title="Drill-down filters">
              The right-hand sliders set a <b>min and max</b> for wallets, locked value (USD), schedules, % vested, and top-holder concentration — e.g. “30–50 wallets, $500k–$1M locked”. The count + pages update to your filters.
            </Section>

            <Section title="The columns">
              <Item k="USD">locked tokens × price (dimmed = thin liquidity, “—” = no market).</Item>
              <Item k="Top recipient">the largest recipient’s share of the <b>locked</b> supply (not total supply). Single-recipient tokens show “—” (always 100%); coloured red/amber only when that wallet is also a material share of market cap.</Item>
              <Item k="Risk">the unlock’s size vs market cap — how hard it could hit the market.</Item>
              <Item k="Vested">a sparkline of the unlock shape (cliff / linear / back-loaded) with a “now” marker.</Item>
              <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Hover any column header for its definition; hover a row for a quick preview.</span>
            </Section>

            <button
              onClick={close}
              className="mt-2 w-full text-sm font-semibold py-2.5 rounded-xl"
              style={{ background: "#0F8A8A", color: "white" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#0F8A8A" }}>{title}</p>
      <div className="text-[13px] leading-relaxed space-y-1" style={{ color: "var(--preview-text-2)" }}>{children}</div>
    </div>
  );
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <p><span className="font-semibold" style={{ color: "var(--preview-text)" }}>{k}</span> — {children}</p>
  );
}
