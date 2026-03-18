import { db } from "@/lib/db";
import { waitlist, apiAccessRequests, apiKeys } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { ApproveButton } from "./ApproveButton";
import { RevokeButton } from "./RevokeButton";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null | string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#4b5563" }}>{label}</p>
      <p className="text-3xl font-bold tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "#4b5563" }}>{sub}</p>}
    </div>
  );
}

export default async function AdminPage() {
  const [waitlistRows, requestRows, keyRows] = await Promise.all([
    db.select().from(waitlist).orderBy(desc(waitlist.createdAt)),
    db.select().from(apiAccessRequests).orderBy(desc(apiAccessRequests.createdAt)),
    db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)),
  ]);

  const pendingRequests = requestRows.filter(r => !r.reviewed);
  const activeKeys      = keyRows.filter(k => !k.revokedAt);

  return (
    <div className="min-h-screen" style={{ background: "#0d0f14", color: "white" }}>

      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1e2330" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <div>
            <span className="font-bold text-base">Vestream</span>
            <span className="text-xs ml-2 px-2 py-0.5 rounded-md font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Admin</span>
          </div>
        </div>
        <a href="/" className="text-xs" style={{ color: "#4b5563" }}>← Back to site</a>
      </header>

      <div className="px-8 py-8 max-w-6xl mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-10">
          <StatCard label="Waitlist" value={waitlistRows.length} sub="total signups" />
          <StatCard label="API Requests" value={requestRows.length} sub={`${pendingRequests.length} pending review`} />
          <StatCard label="Active Keys" value={activeKeys.length} sub={`${keyRows.length} total issued`} />
          <StatCard label="Revoked Keys" value={keyRows.length - activeKeys.length} sub="all time" />
        </div>

        {/* Pending API Access Requests */}
        {pendingRequests.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-lg">Pending API requests</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                {pendingRequests.length} pending
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {pendingRequests.map(r => (
                <div key={r.id} className="rounded-2xl p-6"
                  style={{ background: "#141720", border: "1px solid #2563eb33" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="font-semibold text-sm">{r.name}</span>
                        {r.company && (
                          <span className="text-xs px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(37,99,235,0.15)", color: "#60a5fa" }}>
                            {r.company}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: "#4b5563" }}>{r.email}</span>
                        <span className="text-xs" style={{ color: "#4b5563" }}>{formatDate(r.createdAt)}</span>
                      </div>
                      <p className="text-sm leading-relaxed mb-3" style={{ color: "#9ca3af" }}>{r.useCase}</p>
                      {r.protocols && r.protocols.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {r.protocols.map(p => (
                            <span key={p} className="text-xs px-2 py-0.5 rounded-md"
                              style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}>
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ApproveButton
                      requestId={r.id}
                      email={r.email}
                      name={r.name}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active API Keys */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4">Active API keys ({activeKeys.length})</h2>
          {activeKeys.length === 0 ? (
            <p className="text-sm" style={{ color: "#4b5563" }}>No keys issued yet.</p>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2330" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "#141720", borderBottom: "1px solid #1e2330" }}>
                    {["Owner", "Key prefix", "Tier", "Usage", "Last used", "Issued", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "#4b5563" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeKeys.map((k, i) => (
                    <tr key={k.id} style={{ borderBottom: i < activeKeys.length - 1 ? "1px solid #1e2330" : "none" }}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: "white" }}>{k.ownerEmail}</div>
                        {k.ownerName && <div className="text-xs" style={{ color: "#4b5563" }}>{k.ownerName}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs" style={{ color: "#60a5fa" }}>{k.keyPrefix}...</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-md font-semibold"
                          style={{
                            background: k.tier === "pro" ? "rgba(124,58,237,0.15)" : "rgba(16,185,129,0.1)",
                            color:      k.tier === "pro" ? "#a78bfa"               : "#34d399",
                          }}>
                          {k.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: "#9ca3af" }}>
                          {k.usageThisMonth} / {k.monthlyLimit}
                        </span>
                        <div className="w-20 h-1 rounded-full mt-1" style={{ background: "#1e2330" }}>
                          <div className="h-1 rounded-full" style={{
                            background: "#2563eb",
                            width: `${Math.min(100, (k.usageThisMonth / k.monthlyLimit) * 100)}%`,
                          }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>
                        {formatDate(k.lastUsedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>
                        {formatDate(k.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <RevokeButton keyId={k.id} keyPrefix={k.keyPrefix} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* All API Requests (reviewed) */}
        <section className="mb-10">
          <h2 className="font-bold text-lg mb-4">All API requests ({requestRows.length})</h2>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2330" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#141720", borderBottom: "1px solid #1e2330" }}>
                  {["Name / Company", "Email", "Use case", "Protocols", "Status", "Date"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "#4b5563" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requestRows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: i < requestRows.length - 1 ? "1px solid #1e2330" : "none" }}>
                    <td className="px-4 py-3">
                      <div style={{ color: "white" }}>{r.name}</div>
                      {r.company && <div className="text-xs" style={{ color: "#4b5563" }}>{r.company}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#9ca3af" }}>{r.email}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "#9ca3af" }}>{r.useCase}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(r.protocols ?? []).map(p => (
                          <span key={p} className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(124,58,237,0.12)", color: "#a78bfa" }}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{
                          background: r.reviewed ? "rgba(16,185,129,0.1)"  : "rgba(245,158,11,0.1)",
                          color:      r.reviewed ? "#34d399"                : "#fbbf24",
                        }}>
                        {r.reviewed ? "reviewed" : "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Waitlist */}
        <section>
          <h2 className="font-bold text-lg mb-4">Waitlist ({waitlistRows.length})</h2>
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e2330" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#141720", borderBottom: "1px solid #1e2330" }}>
                  {["Email", "Signed up"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "#4b5563" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waitlistRows.map((w, i) => (
                  <tr key={w.id} style={{ borderBottom: i < waitlistRows.length - 1 ? "1px solid #1e2330" : "none" }}>
                    <td className="px-4 py-3" style={{ color: "#9ca3af" }}>{w.email}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#4b5563" }}>{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}
