// src/app/admin/growth/page.tsx
//
// Internal growth + activity dashboard. Gated by the `vestr_admin` cookie
// via middleware (see src/middleware.ts:62). Reads directly from Postgres
// — no API hop, no client-side state, no cache. force-dynamic so every
// load is fresh.
//
// Panels:
//   - Users         Total / 7d / 30d signups, DAU/WAU/MAU, tier breakdown
//   - Searches      Counts, unique searchers, source breakdown, top wallets
//   - Activity      Recent N searches + signups (audit-style feed)
//   - Tracked       Total tracked wallets, average per user, new this week
//
// Implementation notes:
//   - All queries are raw `sql` template literals rather than Drizzle's
//     query builder — for aggregates with subqueries the SQL is clearer
//     read top-down than method-chained, and admin pages don't need the
//     type-safety of the builder.
//   - Run in Promise.all so the page renders ~50ms instead of summed
//     query times (~200-400ms total).
//   - No charts. Numbers + tables. This is an admin tool, not marketing.

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Drizzle's db.execute<T> requires T extends Record<string, unknown>, so
// each row type carries an open index signature alongside its known keys.
type Row<T> = T & Record<string, unknown>;

type CountRow         = Row<{ count: number }>;
type SignupsByDayRow  = Row<{ day: string; n: number }>;
type TopSearchRow     = Row<{ wallet_address: string; n: number }>;
type RecentSearchRow  = Row<{
  wallet_address: string;
  source:         string;
  chain_id:       number | null;
  user_id:        string | null;
  email_hash:     string | null;
  created_at:     Date;
}>;
type TierRow          = Row<{ tier: string; n: number }>;
type RecentUserRow    = Row<{
  id:         string;
  address:    string;
  tier:       string;
  created_at: Date;
}>;
type SourceRow        = Row<{ source: string; n: number }>;

export default async function GrowthDashboard() {
  // Promise.all over every query — total page time = max query time, not
  // sum of query times. ~50ms-100ms on a warm cache.
  const [
    totalUsers,
    mobileUsers,
    webUsers,
    signups7d,
    signups30d,
    signupsByDay,
    dau,
    wau,
    mau,
    tierBreakdown,
    totalSearches,
    searches7d,
    uniqueSearchers7d,
    sourceBreakdown,
    topSearchedWallets,
    recentSearches,
    totalTrackedWallets,
    newTrackedWallets7d,
    recentUsers,
  ] = await Promise.all([
    // ── User counts ──────────────────────────────────────────────────────
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE address LIKE '%@%'`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE address NOT LIKE '%@%'`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE created_at > NOW() - INTERVAL '30 days'`),
    db.execute<SignupsByDayRow>(sql`
      SELECT TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
      FROM users
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
    `),

    // ── Active users (drives DAU/WAU/MAU) ────────────────────────────────
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE last_active_at > NOW() - INTERVAL '1 day'`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE last_active_at > NOW() - INTERVAL '7 days'`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM users WHERE last_active_at > NOW() - INTERVAL '30 days'`),

    // ── Tier breakdown ───────────────────────────────────────────────────
    db.execute<TierRow>(sql`SELECT tier, COUNT(*)::int AS n FROM users GROUP BY tier`),

    // ── Searches ─────────────────────────────────────────────────────────
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM wallet_searches`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM wallet_searches WHERE created_at > NOW() - INTERVAL '7 days'`),
    db.execute<CountRow>(sql`
      SELECT COUNT(*)::int AS count FROM (
        SELECT DISTINCT COALESCE(user_id::text, ip_hash, 'unknown') AS searcher
        FROM wallet_searches
        WHERE created_at > NOW() - INTERVAL '7 days'
      ) sub
    `),
    db.execute<SourceRow>(sql`
      SELECT source, COUNT(*)::int AS n
      FROM wallet_searches
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY source
      ORDER BY n DESC
    `),
    db.execute<TopSearchRow>(sql`
      SELECT wallet_address, COUNT(*)::int AS n
      FROM wallet_searches
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY wallet_address
      ORDER BY n DESC
      LIMIT 20
    `),
    db.execute<RecentSearchRow>(sql`
      SELECT wallet_address, source, chain_id, user_id, email_hash, created_at
      FROM wallet_searches
      ORDER BY created_at DESC
      LIMIT 50
    `),

    // ── Tracked wallets ──────────────────────────────────────────────────
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM wallets`),
    db.execute<CountRow>(sql`SELECT COUNT(*)::int AS count FROM wallets WHERE added_at > NOW() - INTERVAL '7 days'`),

    // ── Recent signups (audit feed) ──────────────────────────────────────
    db.execute<RecentUserRow>(sql`
      SELECT id, address, tier, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 30
    `),
  ]);

  // Drizzle + postgres-js returns rows as a direct array, not wrapped in
  // `{ rows: [...] }` (that's the node-postgres / Drizzle-Neon shape).
  // First-element accessor is safe — every COUNT query returns exactly one row.
  const totalUsersCount  = totalUsers[0]?.count ?? 0;
  const mobileCount      = mobileUsers[0]?.count ?? 0;
  const webCount         = webUsers[0]?.count ?? 0;
  const signups7dCount   = signups7d[0]?.count ?? 0;
  const signups30dCount  = signups30d[0]?.count ?? 0;
  const dauCount         = dau[0]?.count ?? 0;
  const wauCount         = wau[0]?.count ?? 0;
  const mauCount         = mau[0]?.count ?? 0;
  const totalSearchCount = totalSearches[0]?.count ?? 0;
  const searches7dCount  = searches7d[0]?.count ?? 0;
  const uniqueSearchers7dCount = uniqueSearchers7d[0]?.count ?? 0;
  const totalTracked     = totalTrackedWallets[0]?.count ?? 0;
  const newTracked7d     = newTrackedWallets7d[0]?.count ?? 0;

  const tierMap: Record<string, number> = {};
  for (const row of tierBreakdown) tierMap[row.tier] = row.n;

  const avgWalletsPerUser = totalUsersCount > 0
    ? (totalTracked / totalUsersCount).toFixed(2)
    : "0.00";

  return (
    <main className="min-h-screen" style={{ background: "#0d1b35", color: "white" }}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-12">

        <header className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#60a5fa" }}>
            Admin · Growth
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mb-2" style={{ letterSpacing: "-0.02em" }}>
            Growth & Activity
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
            Live numbers from Postgres. force-dynamic — every refresh is fresh.
          </p>
        </header>

        {/* ── USERS ─────────────────────────────────────────────────────── */}
        <Section title="Users">
          <StatGrid>
            <Stat label="Total accounts"     value={totalUsersCount} />
            <Stat label="Mobile (email)"     value={mobileCount} />
            <Stat label="Web (wallet)"       value={webCount} />
            <Stat label="Signups last 7d"    value={signups7dCount} accent />
            <Stat label="Signups last 30d"   value={signups30dCount} />
            <Stat label="DAU"                value={dauCount} accent />
            <Stat label="WAU"                value={wauCount} />
            <Stat label="MAU"                value={mauCount} />
          </StatGrid>

          {Object.keys(tierMap).length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                By tier
              </h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(tierMap).map(([tier, n]) => (
                  <span
                    key={tier}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <span style={{ color: tier === "pro" ? "#60a5fa" : tier === "mobile" ? "#7c3aed" : "rgba(255,255,255,0.55)" }}>
                      {tier}
                    </span>
                    <span className="ml-2" style={{ color: "white" }}>{n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {signupsByDay.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                Signups last 30 days
              </h3>
              <div className="rounded-2xl p-4" style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
                <table className="w-full text-sm">
                  <tbody>
                    {signupsByDay.map((row) => (
                      <tr key={row.day}>
                        <td className="py-1" style={{ color: "rgba(255,255,255,0.55)" }}>{row.day}</td>
                        <td className="py-1 text-right font-semibold">{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        {/* ── SEARCHES ──────────────────────────────────────────────────── */}
        <Section title="Wallet searches">
          <StatGrid>
            <Stat label="Total searches"           value={totalSearchCount} />
            <Stat label="Searches last 7d"         value={searches7dCount} accent />
            <Stat label="Unique searchers (7d)"    value={uniqueSearchers7dCount} />
          </StatGrid>

          {sourceBreakdown.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                By source · last 30 days
              </h3>
              <div className="flex flex-wrap gap-2">
                {sourceBreakdown.map((row) => (
                  <span
                    key={row.source}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.09)" }}
                  >
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>{row.source}</span>
                    <span className="ml-2" style={{ color: "white" }}>{row.n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {topSearchedWallets.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                Top searched wallets · last 30 days
              </h3>
              <div className="rounded-2xl overflow-hidden" style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Wallet</th>
                      <th className="text-right p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Searches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSearchedWallets.map((row, i) => (
                      <tr key={row.wallet_address} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                        <td className="p-3 font-mono text-xs" style={{ color: "rgba(255,255,255,0.85)" }}>{shortAddr(row.wallet_address)}</td>
                        <td className="p-3 text-right font-semibold">{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {recentSearches.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
                Recent searches · last 50
              </h3>
              <div className="rounded-2xl overflow-hidden" style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>When</th>
                      <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Wallet</th>
                      <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Source</th>
                      <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Who</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSearches.map((row, i) => (
                      <tr key={`${row.wallet_address}-${row.created_at.toISOString()}`} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                        <td className="p-3 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{relTime(row.created_at)}</td>
                        <td className="p-3 font-mono text-xs">{shortAddr(row.wallet_address)}</td>
                        <td className="p-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>{row.source}</td>
                        <td className="p-3 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                          {row.user_id ? "user " + row.user_id.slice(0, 8) :
                           row.email_hash ? "via email" :
                           "anonymous"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        {/* ── TRACKED ───────────────────────────────────────────────────── */}
        <Section title="Tracked wallets">
          <StatGrid>
            <Stat label="Total tracked"           value={totalTracked} />
            <Stat label="Avg wallets per user"    value={avgWalletsPerUser} />
            <Stat label="New this week"           value={newTracked7d} accent />
          </StatGrid>
        </Section>

        {/* ── RECENT USERS ──────────────────────────────────────────────── */}
        <Section title="Recent signups">
          <div className="rounded-2xl overflow-hidden" style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>When</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Address / Email</th>
                  <th className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Tier</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((u, i) => (
                  <tr key={u.id} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
                    <td className="p-3 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{relTime(u.created_at)}</td>
                    <td className="p-3 font-mono text-xs">{u.address.includes("@") ? u.address : shortAddr(u.address)}</td>
                    <td className="p-3 text-xs">
                      <span style={{ color: u.tier === "pro" ? "#60a5fa" : u.tier === "mobile" ? "#7c3aed" : "rgba(255,255,255,0.55)" }}>
                        {u.tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

      </div>
    </main>
  );
}

// ── Tiny presentational helpers ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-xl font-semibold mb-4" style={{ letterSpacing: "-0.01em" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "#122040",
        border: `1px solid ${accent ? "rgba(37,99,235,0.3)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: accent ? "#60a5fa" : "white" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

// Display helpers — kept inline rather than imported to keep the page
// self-contained (one file = one feature).

function shortAddr(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function relTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60)     return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)     return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr < 24)      return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30)     return `${day}d ago`;
  const mo  = Math.floor(day / 30);
  if (mo < 12)      return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
