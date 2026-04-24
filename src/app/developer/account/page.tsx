import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatDate(d: Date | null | string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default async function DeveloperAccount() {
  const cookieStore = await cookies();
  const keyId = cookieStore.get("vestr_api_access")?.value;

  if (!keyId) redirect("/developer/portal");

  const [key] = await db
    .select({
      keyPrefix:      apiKeys.keyPrefix,
      ownerEmail:     apiKeys.ownerEmail,
      ownerName:      apiKeys.ownerName,
      tier:           apiKeys.tier,
      monthlyLimit:   apiKeys.monthlyLimit,
      usageThisMonth: apiKeys.usageThisMonth,
      lastUsedAt:     apiKeys.lastUsedAt,
      createdAt:      apiKeys.createdAt,
      revokedAt:      apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1);

  // Key not found or revoked — clear session
  if (!key || key.revokedAt) redirect("/developer/portal");

  const usagePct = Math.min(100, Math.round((key.usageThisMonth / key.monthlyLimit) * 100));
  const remaining = key.monthlyLimit - key.usageThisMonth;
  const isNearLimit = usagePct >= 80;
  const isPro = key.tier === "pro";

  return (
    <div className="min-h-screen" style={{ background: "#0d0f14", color: "white" }}>

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-8 h-16"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(13,15,20,0.95)" }}>
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <span className="font-bold text-base tracking-tight text-white">TokenVest</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/api-docs"
            className="text-sm font-semibold px-4 py-1.5 rounded-xl transition-all hover:opacity-90"
            style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.25)", color: "#60a5fa" }}>
            API Docs →
          </Link>
          <form action="/api/developer/logout" method="POST">
            <button type="submit" className="text-xs transition-colors hover:opacity-60"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* ── Header ── */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            Developer Account
          </p>
          <h1 className="text-2xl font-bold tracking-tight mb-1">
            {key.ownerName ? `Welcome back, ${key.ownerName.split(" ")[0]}` : "Your API account"}
          </h1>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{key.ownerEmail}</p>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {/* Usage */}
          <div className="rounded-2xl p-5 col-span-2"
            style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              Usage this month
            </p>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold tracking-tight">
                {key.usageThisMonth.toLocaleString()}
              </span>
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                / {key.monthlyLimit.toLocaleString()} requests
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 rounded-full mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div className="h-2 rounded-full transition-all" style={{
                width: `${usagePct}%`,
                background: isNearLimit
                  ? "linear-gradient(90deg, #f97316, #ef4444)"
                  : "linear-gradient(90deg, #2563eb, #7c3aed)",
              }} />
            </div>
            <p className="text-xs" style={{ color: isNearLimit ? "#f97316" : "rgba(255,255,255,0.3)" }}>
              {isNearLimit
                ? `⚠ ${remaining.toLocaleString()} requests remaining — approaching limit`
                : `${remaining.toLocaleString()} requests remaining`}
            </p>
          </div>

          {/* Tier */}
          <div className="rounded-2xl p-5"
            style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: "rgba(255,255,255,0.3)" }}>
              Plan
            </p>
            <span className="inline-block text-sm font-bold px-3 py-1 rounded-lg mb-3"
              style={{
                background: isPro ? "rgba(124,58,237,0.15)" : "rgba(52,211,153,0.1)",
                color:      isPro ? "#a78bfa"               : "#34d399",
                border:     `1px solid ${isPro ? "rgba(124,58,237,0.25)" : "rgba(52,211,153,0.2)"}`,
              }}>
              {isPro ? "Pro" : "Free"}
            </span>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              {key.monthlyLimit.toLocaleString()} req / month
            </p>
            {!isPro && (
              <Link href="/developer#request-access"
                className="block text-xs mt-3 font-semibold transition-colors hover:opacity-80"
                style={{ color: "#60a5fa" }}>
                Upgrade to Pro →
              </Link>
            )}
          </div>
        </div>

        {/* ── Key details ── */}
        <div className="rounded-2xl p-6 mb-8"
          style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            API Key
          </p>
          <div className="flex items-center gap-3 mb-4">
            <code className="text-sm font-mono px-3 py-2 rounded-lg flex-1"
              style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.07)", color: "#60a5fa" }}>
              {key.keyPrefix}••••••••••••••••••••••••••••••••••••••••••••••••••••••••
            </code>
          </div>
          <div className="flex gap-6 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            <span>Issued {formatDate(key.createdAt)}</span>
            <span>Last used {formatDate(key.lastUsedAt)}</span>
          </div>
          <p className="text-xs mt-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(245,158,11,0.06)", color: "rgba(251,191,36,0.7)", border: "1px solid rgba(245,158,11,0.12)" }}>
            Your full API key was shown once when issued. If you&apos;ve lost it, contact us and we&apos;ll revoke and reissue.
          </p>
        </div>

        {/* ── Quick links ── */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            {
              title: "API Documentation",
              desc: "Interactive Swagger UI — test endpoints with your key",
              href: "/api-docs",
              cta: "Open Docs →",
              color: "#2563eb",
              bg: "rgba(37,99,235,0.08)",
              border: "rgba(37,99,235,0.18)",
            },
            {
              title: "OpenAPI Spec",
              desc: "Machine-readable OpenAPI 3.1 JSON for code generation",
              href: "/openapi.json",
              cta: "Download →",
              color: "#7c3aed",
              bg: "rgba(124,58,237,0.08)",
              border: "rgba(124,58,237,0.18)",
            },
            {
              title: "Support",
              desc: "Questions, issues, or need a higher rate limit?",
              href: "mailto:api@vestream.io",
              cta: "Email us →",
              color: "#0891b2",
              bg: "rgba(8,145,178,0.08)",
              border: "rgba(8,145,178,0.18)",
            },
          ].map(l => (
            <a key={l.title} href={l.href}
              className="rounded-2xl p-5 transition-all hover:opacity-90 block"
              style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-4"
                style={{ background: l.bg, border: `1px solid ${l.border}` }}>
                <span className="w-3 h-3 rounded-full" style={{ background: l.color }} />
              </div>
              <p className="font-semibold text-sm mb-1 text-white">{l.title}</p>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>{l.desc}</p>
              <span className="text-xs font-semibold" style={{ color: l.color }}>{l.cta}</span>
            </a>
          ))}
        </div>

        {/* ── Auth header example ── */}
        <div className="rounded-2xl p-6"
          style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{ color: "rgba(255,255,255,0.3)" }}>
            Making API requests
          </p>
          <pre className="text-xs leading-relaxed overflow-x-auto rounded-xl p-4"
            style={{ background: "#0d0f14", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.06)", fontFamily: "monospace" }}>
            <code>{`curl https://vestream.io/api/v1/wallet/{address}/vestings \\
  -H "Authorization: Bearer ${key.keyPrefix}..."`}</code>
          </pre>
          <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.25)" }}>
            Replace <code style={{ color: "rgba(255,255,255,0.45)" }}>{key.keyPrefix}...</code> with your full API key.
          </p>
        </div>

      </div>
    </div>
  );
}
