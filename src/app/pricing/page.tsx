import Link from "next/link";
import ContactTrigger from "@/components/ContactTrigger";
import { SiteNav } from "@/components/SiteNav";
import PricingCta from "@/components/PricingCta";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Check({ color = "#10b981" }: { color?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill={color} fillOpacity={0.12} />
      <path d="M5 8l2 2 4-4" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill="#94a3b8" fillOpacity={0.1} />
      <path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FeatureItem({ text, included = true, color = "#374151", checkColor }: {
  text: string; included?: boolean; color?: string; checkColor?: string;
}) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      {included ? <Check color={checkColor} /> : <Cross />}
      <span style={{ color: included ? color : "#94a3b8", fontSize: "14px", lineHeight: 1.5 }}>{text}</span>
    </li>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border overflow-hidden"
      style={{ background: "white", borderColor: "rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none"
        style={{ color: "#0f172a" }}>
        <span className="text-sm font-semibold">{q}</span>
        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-transform group-open:rotate-180"
          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}>
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="px-6 pb-5 pt-1">
        <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{a}</p>
      </div>
    </details>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Pricing() {
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  return (
    <div className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <SiteNav />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center px-6 pt-36 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(37,99,235,0.07) 0%, transparent 65%)" }} />

        <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 text-xs font-semibold"
          style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)", color: "#2563eb" }}>
          Simple, transparent pricing
        </div>

        <h1 className="relative text-5xl font-bold tracking-tight mb-4 max-w-2xl"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Start free.{" "}
          <span style={{
            background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #6366f1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Scale when you&apos;re ready.
          </span>
        </h1>
        <p className="relative text-lg max-w-lg mb-2 leading-relaxed" style={{ color: "#64748b" }}>
          From solo investors to investment funds — a plan for every stage.
        </p>
      </section>

      {/* ── Pricing cards ────────────────────────────────────────────────────── */}
      <section className="relative px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* ── Free ── */}
          <div className="rounded-2xl p-7"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#94a3b8" }}>Free</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "#0f172a", letterSpacing: "-0.03em" }}>$0</span>
                <span className="text-sm mb-1.5" style={{ color: "#94a3b8" }}>/month</span>
              </div>
              <p className="text-sm" style={{ color: "#64748b" }}>Free forever. No credit card needed.</p>
            </div>

            <PricingCta
              href="/early-access"
              label="Get early access →"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 mb-6"
              style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb", textDecoration: "none" }}
            />

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Includes</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="1 wallet — auto-scanned across all chains" checkColor="#2563eb" />
              <FeatureItem text="All 7 vesting platforms" checkColor="#2563eb" />
              <FeatureItem text="Real-time vesting dashboard" checkColor="#2563eb" />
              <FeatureItem text="Claimable balance tracking" checkColor="#2563eb" />
              <FeatureItem text="Unlock calendar" checkColor="#2563eb" />
              <FeatureItem text="3 free push alerts (lifetime)" checkColor="#2563eb" />
              <FeatureItem text="Unlimited push alerts" included={false} />
              <FeatureItem text="Email alerts" included={false} />
              <FeatureItem text="Multiple wallets" included={false} />
            </ul>
          </div>

          {/* ── Pro ── (featured) */}
          <div className="relative rounded-2xl p-7"
            style={{
              background: "white",
              border: "2px solid #2563eb",
              boxShadow: "0 8px 32px rgba(37,99,235,0.18), 0 4px 12px rgba(0,0,0,0.08)",
            }}>
            {/* Badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 12px rgba(37,99,235,0.4)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                Most popular
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#2563eb" }}>Pro</p>
              <div className="flex items-end gap-1 mb-0.5">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "#0f172a", letterSpacing: "-0.03em" }}>$7.99</span>
                <span className="text-sm mb-1.5" style={{ color: "#94a3b8" }}>/month</span>
              </div>
              <p className="text-sm" style={{ color: "#64748b" }}>
                Or{" "}
                <span className="font-semibold" style={{ color: "#2563eb" }}>$63.99/year</span>
                {" "}— save 33%
              </p>
            </div>

            <PricingCta
              priceId={proPriceId}
              href="/early-access"
              label="Get started →"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 mb-6"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
            />

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Everything in Free, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="3 wallet addresses" checkColor="#2563eb" />
              <FeatureItem text="Unlimited push alerts before every unlock" checkColor="#2563eb" />
              <FeatureItem text="Email unlock alerts" checkColor="#2563eb" />
              <FeatureItem text="Token Vesting Explorer — Discover any stream on-chain" checkColor="#2563eb" />
              <FeatureItem text="Priority data refresh (60s)" checkColor="#2563eb" />
              <FeatureItem text="CSV & PDF export" checkColor="#2563eb" />
              <FeatureItem text="Ticketing support" checkColor="#2563eb" />
              <FeatureItem text="Search all receivers" included={false} />
              <FeatureItem text="Team workspace" included={false} />
            </ul>
          </div>

          {/* ── Enterprise ── */}
          <div className="relative rounded-2xl p-7"
            style={{
              background: "#0d0f14",
              border: "1px solid rgba(99,102,241,0.3)",
              boxShadow: "0 4px 40px rgba(37,99,235,0.18), 0 24px 64px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 4px 12px rgba(99,102,241,0.4)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                Funds &amp; teams
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#6366f1" }}>Enterprise</p>
              <div className="flex items-end gap-1 mb-0.5">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "white", letterSpacing: "-0.03em" }}>Custom</span>
              </div>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                Built around your team — pricing on request.
              </p>
            </div>

            <ContactTrigger
              label="Contact us →"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 mb-6"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)", textDecoration: "none" }}
            />

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#4b5563" }}>Everything in Pro, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="Unlimited wallet addresses" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Full REST API + MCP server access" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Search all receivers" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Team workspace &amp; shared portfolios" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Slack webhook notifications" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Telegram &amp; WhatsApp alerts" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="SSO &amp; custom SLA" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Dedicated support channel" color="#e5e7eb" checkColor="#10b981" />
            </ul>
          </div>
        </div>

        {/* API nudge */}
        <p className="text-center text-sm mt-8" style={{ color: "#94a3b8" }}>
          Building on Vestream data?{" "}
          <Link href="/developer" className="font-semibold underline" style={{ color: "#2563eb" }}>
            See the Developer API →
          </Link>
        </p>
      </section>

      {/* ── Feature comparison table ──────────────────────────────────────────── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-center mb-8" style={{ color: "#0f172a" }}>Compare plans</h2>

          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            {/* Header */}
            <div className="grid grid-cols-4 px-6 py-4"
              style={{ background: "#f1f5f9", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#94a3b8" }}>Feature</span>
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#94a3b8" }}>Free</span>
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#2563eb" }}>Pro</span>
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#6366f1" }}>Enterprise</span>
            </div>

            {([
              ["Wallet addresses",              "1",               "3 wallets",     "Unlimited"],
              ["Auto-scan (all chains + platforms)", true,         true,            true],
              ["Real-time dashboard",           true,              true,            true],
              ["Claimable balance tracking",    true,              true,            true],
              ["Unlock calendar",               true,              true,            true],
              ["Push notifications",            "3 (lifetime)",    "Unlimited",     "Unlimited"],
              ["Email alerts",                  false,             true,            true],
              ["Token Vesting Explorer",        false,             true,            true],
              ["CSV & PDF export",              false,             true,            true],
              ["REST API + MCP server",         false,             false,           true],
              ["Search all receivers",          false,             false,           true],
              ["Team workspace",                false,             false,           true],
              ["Slack webhook",                 false,             false,           true],
              ["Telegram & WhatsApp alerts",    false,             false,           true],
              ["SSO & custom SLA",              false,             false,           true],
              ["Support",                       false,             "Ticketing",     "Dedicated"],
            ] as [string, string | boolean, string | boolean, string | boolean][]).map(([feature, free, pro, fund], i, arr) => (
              <div key={feature}
                className="grid grid-cols-4 px-6 py-3.5 items-center"
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.05)" : undefined,
                  background: i % 2 === 0 ? "white" : "rgba(248,250,252,0.6)",
                }}>
                <span className="text-sm" style={{ color: "#374151" }}>{feature}</span>
                {/* Free */}
                <div className="flex justify-center">
                  {typeof free === "boolean" ? (
                    free
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2563eb" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#94a3b8" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: "#374151" }}>{free}</span>
                  )}
                </div>
                {/* Pro */}
                <div className="flex justify-center">
                  {typeof pro === "boolean" ? (
                    pro
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2563eb" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#94a3b8" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: "#2563eb" }}>{pro}</span>
                  )}
                </div>
                {/* Fund */}
                <div className="flex justify-center">
                  {typeof fund === "boolean" ? (
                    fund
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#10b981" fillOpacity={0.12}/><path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#94a3b8" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: "#6366f1" }}>{fund}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-center mb-8" style={{ color: "#0f172a" }}>Billing questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <FAQItem
              q="Do I need a credit card to start?"
              a="No. The Free plan requires no payment details at all — just sign up with your email and start tracking. You only need to add a card when you choose to upgrade."
            />
            <FAQItem
              q="What does the Free plan actually let me do?"
              a="The Free plan auto-scans one wallet across every supported chain and all 7 vesting platforms — exactly the same data coverage as Pro. You get the full dashboard, unlock calendar, claimable tracking, and 3 free push notifications (lifetime) to try alerts. Pro unlocks unlimited push alerts, email alerts, more wallets, and Discover."
            />
            <FAQItem
              q="How do the 3 free push alerts work?"
              a="Every Free account gets 3 lifetime push notification credits, consumed one per unlock alert sent to your phone. They're there so you can experience how alerting actually feels on a real unlock before committing to Pro. Upgrade anytime for unlimited alerts."
            />
            <FAQItem
              q="Can I cancel anytime?"
              a="Yes — cancel from your settings page at any time. You'll retain access until the end of your current billing period, then revert to Free."
            />
            <FAQItem
              q="How does annual billing work?"
              a="Pro annual is charged upfront for 12 months at a 33% discount — $63.99/year (~$5.33/mo). You can switch between monthly and annual at renewal."
            />
            <FAQItem
              q="Do you have an API?"
              a="Yes — the Vestream REST API and MCP server are available on the Enterprise plan. You get typed endpoints for every supported protocol, AI-agent-ready tooling, and a developer portal. Contact us for API keys and pricing."
            />
            <FAQItem
              q="I run a fund / team / build an app — what do I do?"
              a="Get in touch via the Enterprise contact form. We scope unlimited wallets, team workspace, SSO, API access, Slack/Telegram integrations, and an SLA to your use case — then quote you accordingly."
            />
          </div>
        </div>
      </section>

      {/* ── CTA strip ────────────────────────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-2xl mx-auto rounded-3xl px-10 py-12 text-center"
          style={{
            background: "linear-gradient(135deg, #1e3a5f 0%, #1a1040 100%)",
            boxShadow: "0 24px 64px rgba(15,23,42,0.22)",
          }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#6366f1" }}>Ready to start?</p>
          <h2 className="text-3xl font-bold mb-3 tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
            Never miss an unlock again.
          </h2>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: "#94a3b8" }}>
            Join investors and funds that use Vestream to stay on top of every vesting schedule.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/early-access"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white" }}>
              Start for free →
            </Link>
            <PricingCta
              priceId={proPriceId}
              href="/early-access"
              label="Upgrade to Pro →"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}
            />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t px-4 md:px-8 py-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "rgba(0,0,0,0.07)", background: "#f8fafc" }}>
        <p className="text-xs" style={{ color: "#94a3b8" }}>© 2026 Vestream. All rights reserved.</p>
        <div className="flex items-center gap-4 md:gap-5 flex-wrap">
          <Link href="/developer" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>Developer API</Link>
          <Link href="/ai" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>AI Agents</Link>
          <Link href="/resources" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>Resources</Link>
          <Link href="/privacy" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>Privacy Policy</Link>
          <Link href="/terms" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>Terms of Service</Link>
        </div>
      </footer>

    </div>
  );
}
