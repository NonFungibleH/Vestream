// Server component — renders a DocPage's typed content blocks to JSX.
// Includes the two "live" blocks (protocols grid, chains grid) that read from
// protocol-constants so docs coverage never drifts from the real integrations.
import React from "react";
import Link from "next/link";
import type { DocBlock } from "@/lib/docs";
import { listProtocols, protocolIcon, chainBrand, chainIcon } from "@/lib/protocol-constants";
import { TESTNET_CHAIN_IDS } from "@vestream/shared";

const LINK = "#2563eb";

/** Minimal inline renderer: [label](href) → link, **bold** → <strong>. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      out.push(
        href.startsWith("/")
          ? <Link key={k++} href={href} style={{ color: LINK, fontWeight: 600 }} className="hover:underline">{m[1]}</Link>
          : <a key={k++} href={href} style={{ color: LINK, fontWeight: 600 }} className="hover:underline">{m[1]}</a>,
      );
    } else if (m[3] !== undefined) {
      out.push(<strong key={k++} style={{ color: "#0f172a", fontWeight: 700 }}>{m[3]}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const CALLOUT_STYLE: Record<string, { bg: string; border: string; label: string; labelColor: string }> = {
  tip:  { bg: "rgba(37,99,235,0.06)",  border: "rgba(37,99,235,0.2)",  label: "Tip",         labelColor: "#2563eb" },
  note: { bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.2)", label: "Note",       labelColor: "#475569" },
  pro:  { bg: "rgba(124,58,237,0.07)",  border: "rgba(124,58,237,0.22)", label: "Pro feature", labelColor: "#7c3aed" },
  free: { bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.22)", label: "Free",        labelColor: "#059669" },
};

function ProtocolsGrid() {
  const protocols = listProtocols();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
      {protocols.map((p) => {
        const icon = protocolIcon(p.slug);
        return (
          <Link key={p.slug} href={`/protocols/${p.slug}`}
            className="flex items-center gap-3 p-4 rounded-2xl transition-colors"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: p.bg, border: `1px solid ${p.border}` }}>
              {icon
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="" width={40} height={40} className="w-full h-full object-contain p-1.5" />
                : <span className="font-extrabold text-lg" style={{ color: p.color }}>{p.name[0]}</span>}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate" style={{ color: "#0f172a" }}>{p.name}</p>
              <p className="text-xs truncate" style={{ color: "#64748b" }}>{p.tagline}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ChainsGrid() {
  const ids = [...new Set(listProtocols().flatMap((p) => p.chainIds))]
    .filter((id) => !TESTNET_CHAIN_IDS.includes(id as never));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-5">
      {ids.map((id) => {
        const b = chainBrand(id);
        const icon = chainIcon(id);
        return (
          <div key={id} className="flex items-center gap-2.5 p-3 rounded-xl"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: b.bg, border: `1px solid ${b.border}` }}>
              {icon
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="" width={28} height={28} className="w-full h-full object-contain p-0.5" />
                : <span className="font-bold text-xs" style={{ color: b.color }}>{b.name[0]}</span>}
            </div>
            <span className="text-sm font-semibold" style={{ color: "#0f172a" }}>{b.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DocsBody({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="max-w-none">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "lead":
            return <p key={i} className="text-lg leading-relaxed mb-6" style={{ color: "#334155" }}>{inline(b.text)}</p>;
          case "h2":
            return <h2 key={i} className="text-xl font-bold mt-10 mb-3" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>{b.text}</h2>;
          case "p":
            return <p key={i} className="text-[15px] leading-relaxed mb-4" style={{ color: "#475569" }}>{inline(b.text)}</p>;
          case "steps":
            return (
              <ol key={i} className="space-y-3 mb-5 mt-2">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-3 text-[15px] leading-relaxed" style={{ color: "#475569" }}>
                    <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>{j + 1}</span>
                    <span className="pt-0.5">{inline(it)}</span>
                  </li>
                ))}
              </ol>
            );
          case "list":
            return (
              <ul key={i} className="space-y-2 mb-5 mt-1">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5 text-[15px] leading-relaxed" style={{ color: "#475569" }}>
                    <span className="flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full" style={{ background: "#2563eb" }} />
                    <span>{inline(it)}</span>
                  </li>
                ))}
              </ul>
            );
          case "callout": {
            const s = CALLOUT_STYLE[b.tone];
            return (
              <div key={i} className="rounded-xl p-4 my-5" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: s.labelColor }}>{s.label}</p>
                <p className="text-sm leading-relaxed" style={{ color: "#334155" }}>{inline(b.text)}</p>
              </div>
            );
          }
          case "cards":
            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
                {b.items.map((c, j) => {
                  const inner = (
                    <>
                      <p className="font-bold text-sm mb-1" style={{ color: "#0f172a" }}>{c.title}</p>
                      <p className="text-[13px] leading-relaxed" style={{ color: "#64748b" }}>{c.body}</p>
                    </>
                  );
                  return c.href ? (
                    <Link key={j} href={c.href} className="block p-4 rounded-2xl transition-colors" style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>{inner}</Link>
                  ) : (
                    <div key={j} className="p-4 rounded-2xl" style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>{inner}</div>
                  );
                })}
              </div>
            );
          case "protocols":
            return <ProtocolsGrid key={i} />;
          case "chains":
            return <ChainsGrid key={i} />;
          case "cta":
            return (
              <Link key={i} href={b.href}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm my-4"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 4px 20px rgba(37,99,235,0.3)" }}>
                {b.label}
              </Link>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
