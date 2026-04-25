import Link from "next/link";
import { db } from "@/lib/db";
import { waitlist, apiAccessRequests, apiKeys, users, wallets, vestingStreamsCache, notificationPreferences, betaFeedback } from "@/lib/db/schema";
import { desc, sql, count } from "drizzle-orm";
import { ApproveButton } from "./ApproveButton";
import { RevokeButton } from "./RevokeButton";

export const dynamic = "force-dynamic";

const BETA_MAX = 100;

const CHAIN_NAMES: Record<number, string> = {
  1:        "Ethereum",
  56:       "BNB Chain",
  137:      "Polygon",
  8453:     "Base",
  11155111: "Sepolia",
};

const CHAIN_COLORS: Record<number, string> = {
  1:        "#627eea",
  56:       "#f3ba2f",
  137:      "#8247e5",
  8453:     "#1CB8B8",
  11155111: "#B8BABD",
};

const PROTOCOL_COLORS: Record<string, string> = {
  sablier:        "#f97316",
  hedgey:         "#1CB8B8",
  "team-finance": "#2D8A4A",
  uncx:           "#C47A1A",
  "uncx-vm":      "#C47A1A",
  unvest:         "#0891b2",
};

function formatDate(d: Date | null | string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "#141720", border: `1px solid ${accent ? accent + "33" : "#1e2330"}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#4b5563" }}>{label}</p>
      <p className="text-3xl font-bold tracking-tight" style={{ color: accent ?? "white", letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "#4b5563" }}>{sub}</p>}
    </div>
  );
}

function HBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-right shrink-0" style={{ color: "#9ca3af" }}>{label}</div>
      <div className="flex-1 h-2 rounded-full" style={{ background: "#1e2330" }}>
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-16 text-xs shrink-0" style={{ color: "#9ca3af" }}>
        {value.toLocaleString()} {sub && <span style={{ color: "#4b5563" }}>{sub}</span>}
      </div>
    </div>
  );
}

export default async function AdminPage() {
  // Use allSettled + 10 s timeout so a slow query never blocks the whole page
  function withTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
    return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  }

  const results = await Promise.allSettled([
    withTimeout(db.select().from(waitlist).orderBy(desc(waitlist.createdAt))),
    withTimeout(db.select().from(apiAccessRequests).orderBy(desc(apiAccessRequests.createdAt))),
    withTimeout(db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt))),

    withTimeout(db.select().from(users).orderBy(desc(users.createdAt))),
    withTimeout(db.select().from(wallets)),

    withTimeout(db.select({ protocol: vestingStreamsCache.protocol, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.protocol).orderBy(sql`count(*) desc`)),

    withTimeout(db.select({ chainId: vestingStreamsCache.chainId, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.chainId).orderBy(sql`count(*) desc`)),

    withTimeout(db.select({ symbol: vestingStreamsCache.tokenSymbol, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.tokenSymbol).orderBy(sql`count(*) desc`).limit(8)),

    withTimeout(db.select({ isFullyVested: vestingStreamsCache.isFullyVested, cnt: count() })
      .from(vestingStreamsCache).groupBy(vestingStreamsCache.isFullyVested)),

    withTimeout(db.select({ cnt: count() }).from(notificationPreferences).where(sql`email_enabled = true`)),

    withTimeout(db.select().from(betaFeedback).orderBy(desc(betaFeedback.createdAt)).limit(10)),

    withTimeout(db.select({
      day: sql<string>`date_trunc('day', created_at)::date::text`,
      cnt: count(),
    }).from(users).where(sql`created_at >= now() - interval '30 days'`)
      .groupBy(sql`date_trunc('day', created_at)::date`).orderBy(sql`date_trunc('day', created_at)::date`)),
  ]);

  // Unwrap allSettled results — fall back to empty arrays so timed-out queries degrade gracefully
  function ok<T>(r: PromiseSettledResult<T>, fallback: T): T {
    return r.status === "fulfilled" ? r.value : (console.error("admin query failed:", (r as PromiseRejectedResult).reason), fallback);
  }
  const waitlistRows       = ok(results[0],  []);
  const requestRows        = ok(results[1],  []);
  const keyRows            = ok(results[2],  []);
  const userRows           = ok(results[3],  []);
  const walletRows         = ok(results[4],  []);
  const streamsByProtocol  = ok(results[5],  []);
  const streamsByChain     = ok(results[6],  []);
  const streamsByToken     = ok(results[7],  []);
  const streamTotals       = ok(results[8],  []);
  const emailAlertsCount   = ok(results[9],  [{ cnt: 0 }]);
  const feedbackRows       = ok(results[10], []);
  const signupTrend        = ok(results[11], []);

  const pendingRequests = requestRows.filter(r => !r.reviewed);
  const activeKeys      = keyRows.filter(k => !k.revokedAt);

  // ── Derived analytics ───────────────────────────────────────────────────────
  const totalUsers    = userRows.length;
  const totalWallets  = walletRows.length;
  const totalStreams   = streamsByProtocol.reduce((s, r) => s + Number(r.cnt), 0);
  const activeStreams  = streamTotals.find(r => !r.isFullyVested)?.cnt ?? 0;
  const emailAlerts   = Number(emailAlertsCount[0]?.cnt ?? 0);
  const avgRating     = feedbackRows.filter(f => f.rating).length > 0
    ? (feedbackRows.filter(f => f.rating).reduce((s, f) => s + (f.rating ?? 0), 0) / feedbackRows.filter(f => f.rating).length).toFixed(1)
    : "—";

  const maxProtocolStreams = Math.max(...streamsByProtocol.map(r => Number(r.cnt)), 1);
  const maxChainStreams    = Math.max(...streamsByChain.map(r => Number(r.cnt)), 1);
  const maxTokenStreams    = Math.max(...streamsByToken.map(r => Number(r.cnt)), 1);

  // tier breakdown
  const tierCounts = userRows.reduce<Record<string, number>>((acc, u) => {
    acc[u.tier] = (acc[u.tier] ?? 0) + 1; return acc;
  }, {});

  // wallet chain preference (null = all chains)
  const chainFilterCounts = walletRows.reduce<Record<string, number>>((acc, w) => {
    const key = w.chains?.length ? w.chains.join(",") : "all";
    acc[key] = (acc[key] ?? 0) + 1; return acc;
  }, {});
  const walletsAllChains = chainFilterCounts["all"] ?? 0;

  // sign-up trend: fill in zeros for missing days (last 14 days)
  const today = new Date();
  const trendDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const trendMap = Object.fromEntries(signupTrend.map(r => [r.day, Number(r.cnt)]));
  const trendData = trendDays.map(d => ({ day: d, cnt: trendMap[d] ?? 0 }));
  const maxTrend = Math.max(...trendData.map(d => d.cnt), 1);

  return (
    <div className="min-h-screen" style={{ background: "#0d0f14", color: "white" }}>

      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1e2330" }}>
        <div className="flex items-center gap-3">
          <img src="/logo-icon.svg" alt="Vestream" className="w-8 h-8" />
          <div>
            <span className="font-bold text-base">Vestream</span>
            <span className="text-xs ml-2 px-2 py-0.5 rounded-md font-semibold"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>Admin</span>
          </div>
        </div>
        <Link href="/" className="text-xs" style={{ color: "#4b5563" }}>← Back to site</Link>
      </header>

      <div className="px-8 py-8 max-w-6xl mx-auto">

        {/* ── Beta Analytics ─────────────────────────────────────────────────── */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-bold text-xl">Beta Analytics</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(15,138,138,0.2)", color: "#a78bfa" }}>
              {totalUsers} / {BETA_MAX} spots
            </span>
          </div>

          {/* Row 1: key metrics */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <StatCard label="Beta users" value={totalUsers} sub={`${BETA_MAX - totalUsers} spots left`} accent="#0F8A8A" />
            <StatCard label="Wallets tracked" value={totalWallets} sub={`${(totalWallets / Math.max(totalUsers, 1)).toFixed(1)} avg / user`} accent="#1CB8B8" />
            <StatCard label="Streams cached" value={totalStreams.toLocaleString()} sub={`${Number(activeStreams).toLocaleString()} active`} accent="#2D8A4A" />
            <StatCard label="Email alerts" value={emailAlerts} sub={`${Math.round((emailAlerts / Math.max(totalUsers, 1)) * 100)}% adoption`} accent="#f97316" />
            <StatCard label="Waitlist" value={waitlistRows.length} sub="all time" />
            <StatCard label="Feedback" value={feedbackRows.length} sub={avgRating !== "—" ? `avg ${avgRating}★` : "no ratings yet"} accent="#C47A1A" />
          </div>

          {/* Row 2: beta cap bar + sign-up trend */}
          <div className="grid grid-cols-2 gap-4 mb-4">

            {/* Beta capacity */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Beta capacity</p>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-bold" style={{ color: "white", letterSpacing: "-0.03em" }}>{totalUsers}</span>
                <span className="text-lg mb-1" style={{ color: "#4b5563" }}>/ {BETA_MAX}</span>
              </div>
              <div className="w-full h-3 rounded-full mb-3" style={{ background: "#1e2330" }}>
                <div className="h-3 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (totalUsers / BETA_MAX) * 100)}%`,
                    background: totalUsers >= BETA_MAX ? "#B3322E" : "linear-gradient(90deg, #1CB8B8, #0F8A8A)",
                  }} />
              </div>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(tierCounts).map(([tier, n]) => (
                  <span key={tier} className="text-xs px-2 py-0.5 rounded-md font-semibold"
                    style={{
                      background: tier === "fund" ? "rgba(45,138,74,0.15)" : tier === "pro" ? "rgba(28,184,184,0.15)" : "rgba(75,85,99,0.2)",
                      color: tier === "fund" ? "#2D8A4A" : tier === "pro" ? "#1CB8B8" : "#9ca3af",
                    }}>
                    {n} {tier}
                  </span>
                ))}
              </div>
            </div>

            {/* Sign-up trend sparkline */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Sign-ups · last 14 days</p>
              <div className="flex items-end gap-1 h-16">
                {trendData.map(({ day, cnt }) => (
                  <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
                    <div className="w-full rounded-sm transition-all"
                      style={{
                        height: `${Math.max(4, (cnt / maxTrend) * 100)}%`,
                        background: cnt > 0 ? "linear-gradient(180deg, #0F8A8A, #1CB8B8)" : "#1e2330",
                        minHeight: "4px",
                      }} />
                    {/* tooltip on hover */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10
                      text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
                      style={{ background: "#0d0f14", border: "1px solid #1e2330", color: "#9ca3af" }}>
                      {day.slice(5)} · {cnt}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{trendDays[0].slice(5)}</span>
                <span className="text-[10px]" style={{ color: "#4b5563" }}>{trendDays[13].slice(5)}</span>
              </div>
            </div>
          </div>

          {/* Row 3: protocol breakdown + chain breakdown + top tokens */}
          <div className="grid grid-cols-3 gap-4 mb-4">

            {/* Protocol breakdown */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Streams by protocol</p>
              {streamsByProtocol.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No streams cached yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {streamsByProtocol.map(r => {
                    const label = r.protocol === "team-finance" ? "Team Finance"
                      : r.protocol === "uncx-vm" ? "UNCX VM"
                      : r.protocol.charAt(0).toUpperCase() + r.protocol.slice(1);
                    const color = PROTOCOL_COLORS[r.protocol] ?? "#4b5563";
                    return (
                      <HBar key={r.protocol} label={label} value={Number(r.cnt)} max={maxProtocolStreams} color={color} />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chain breakdown */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Streams by chain</p>
              {streamsByChain.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No streams cached yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {streamsByChain.map(r => {
                    const label = CHAIN_NAMES[r.chainId] ?? `Chain ${r.chainId}`;
                    const color = CHAIN_COLORS[r.chainId] ?? "#4b5563";
                    return (
                      <HBar key={r.chainId} label={label} value={Number(r.cnt)} max={maxChainStreams} color={color} />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top tokens */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Top tokens tracked</p>
              {streamsByToken.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No streams cached yet</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {streamsByToken.map(r => (
                    <HBar key={r.symbol ?? "?"} label={r.symbol ?? "Unknown"} value={Number(r.cnt)} max={maxTokenStreams} color="#1CB8B8" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 4: wallet config + feedback */}
          <div className="grid grid-cols-2 gap-4">

            {/* Wallet config */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Wallet configuration</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{walletsAllChains}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>watching all chains</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{totalWallets - walletsAllChains}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>chain-specific filter</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{emailAlerts}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>email alerts enabled</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: "white" }}>{walletRows.filter(w => w.tokenAddress).length}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>token-specific filter</p>
                </div>
              </div>
              {/* Users breakdown */}
              <div className="pt-4" style={{ borderTop: "1px solid #1e2330" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#4b5563" }}>Avg wallets per user</span>
                  <span className="text-xs font-semibold" style={{ color: "white" }}>
                    {(totalWallets / Math.max(totalUsers, 1)).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs" style={{ color: "#4b5563" }}>Users with 0 wallets</span>
                  <span className="text-xs font-semibold" style={{ color: "#f87171" }}>
                    {userRows.filter(u => !walletRows.some(w => w.userId === u.id)).length}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs" style={{ color: "#4b5563" }}>Users at wallet limit (3)</span>
                  <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>
                    {userRows.filter(u => walletRows.filter(w => w.userId === u.id).length >= 3).length}
                  </span>
                </div>
              </div>
            </div>

            {/* Feedback */}
            <div className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid #1e2330" }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4b5563" }}>Beta feedback</p>
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(n => (
                    <span key={n} className="text-sm"
                      style={{ color: avgRating !== "—" && n <= Math.round(Number(avgRating)) ? "#C47A1A" : "#1e2330" }}>★</span>
                  ))}
                  <span className="text-xs ml-1" style={{ color: "#9ca3af" }}>{avgRating}</span>
                </div>
              </div>
              {feedbackRows.length === 0 ? (
                <p className="text-xs" style={{ color: "#4b5563" }}>No feedback yet.</p>
              ) : (
                <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-1">
                  {feedbackRows.map(f => (
                    <div key={f.id} className="rounded-xl px-4 py-3" style={{ background: "#0d0f14", border: "1px solid #1e2330" }}>
                      <div className="flex items-center gap-2 mb-1">
                        {f.rating && (
                          <span className="text-xs font-semibold" style={{ color: "#C47A1A" }}>{"★".repeat(f.rating)}</span>
                        )}
                        <span className="text-[10px]" style={{ color: "#4b5563" }}>{formatDate(f.createdAt)}</span>
                        {f.userAddress && (
                          <code className="text-[10px]" style={{ color: "#4b5563" }}>
                            {f.userAddress.slice(0, 6)}…{f.userAddress.slice(-4)}
                          </code>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "#9ca3af" }}>{f.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Operations ─────────────────────────────────────────────────────── */}
        <div className="mb-6" style={{ borderTop: "1px solid #1e2330", paddingTop: "2rem" }}>
          <h2 className="font-bold text-xl mb-6">Operations</h2>
        </div>

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
                  style={{ background: "#141720", border: "1px solid #1CB8B833" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="font-semibold text-sm">{r.name}</span>
                        {r.company && (
                          <span className="text-xs px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}>
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
                              style={{ background: "rgba(15,138,138,0.15)", color: "#a78bfa" }}>
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
                        <code className="text-xs" style={{ color: "#1CB8B8" }}>{k.keyPrefix}...</code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-md font-semibold"
                          style={{
                            background: k.tier === "pro" ? "rgba(15,138,138,0.15)" : "rgba(16,185,129,0.1)",
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
                            background: "#1CB8B8",
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
                            style={{ background: "rgba(15,138,138,0.12)", color: "#a78bfa" }}>{p}</span>
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
