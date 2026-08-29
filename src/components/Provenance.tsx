// Provenance — the "NUMBER → SOURCE → TIMESTAMP → METHODOLOGY" trust line that
// sits under important data figures. Increases trust for users, journalists,
// search engines and AI systems (GEO). Server component, no client JS.
//
// We render a stable DATE (not "14 minutes ago") on purpose: relative-time
// strings leak through ISR caches and read as stale/misleading — a dated,
// verifiable value is the honest signal.
import Link from "next/link";

interface Props {
  /** e.g. "Vestream On-Chain Index" or "DefiLlama". Defaults to the Vestream index. */
  source?: string;
  /** ISO timestamp of when the data was last computed. Rendered as a date. */
  updatedISO?: string;
  /** Link to the methodology explanation. Defaults to /methodology. */
  methodologyHref?: string;
  className?: string;
}

function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function Provenance({ source = "Vestream On-Chain Index", updatedISO, methodologyHref = "/methodology", className }: Props) {
  const updated = fmtDate(updatedISO);
  return (
    <p className={`text-[11px] leading-relaxed ${className ?? ""}`} style={{ color: "#8B8E92" }}>
      <span>Source: </span>
      <span style={{ color: "#5b6470" }}>{source}</span>
      {updated && <> · Updated {updated}</>}
      {" · "}
      <Link href={methodologyHref} style={{ color: "#0F8A8A", fontWeight: 600 }}>Methodology</Link>
    </p>
  );
}
