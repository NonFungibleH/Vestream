import Link from "next/link";
import ContactTrigger from "@/components/ContactTrigger";
import { SiteNav } from "@/components/SiteNav";

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

            <Link href="/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 mb-6"
              style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb" }}>
              Get started free →
            </Link>

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Includes</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="1 wallet address" checkColor="#2563eb" />
              <FeatureItem text="1 blockchain of your choice" checkColor="#2563eb" />
              <FeatureItem text="Real-time vesting dashboard" checkColor="#2563eb" />
              <FeatureItem text="Claimable balance tracking" checkColor="#2563eb" />
              <FeatureItem text="Unlock calendar" checkColor="#2563eb" />
              <FeatureItem text="All 5 vesting platforms" checkColor="#2563eb" />
              <FeatureItem text="Email alerts" included={false} />
              <FeatureItem text="CSV & PDF export" included={false} />
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
                <span className="text-4xl font-bold tracking-tight" style={{ color: "#0f172a", letterSpacing: "-0.03em" }}>$19.99</span>
                <span className="text-sm mb-1.5" style={{ color: "#94a3b8" }}>/month</span>
              </div>
              <p className="text-sm" style={{ color: "#64748b" }}>
                Or{" "}
                <span className="font-semibold" style={{ color: "#2563eb" }}>$191.90/year</span>
                {" "}— save 20%
              </p>
            </div>

            <Link href="/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 mb-6"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
              Start free trial →
            </Link>

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Everything in Free, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="5 wallet addresses" checkColor="#2563eb" />
              <FeatureItem text="5 blockchains" checkColor="#2563eb" />
              <FeatureItem text="Email unlock alerts" checkColor="#2563eb" />
              <FeatureItem text="Token Vesting Explorer" checkColor="#2563eb" />
              <FeatureItem text="Unlock calendar" checkColor="#2563eb" />
              <FeatureItem text="CSV & PDF export" checkColor="#2563eb" />
              <FeatureItem text="Ticketing support" checkColor="#2563eb" />
              <FeatureItem text="Search all receivers" included={false} />
              <FeatureItem text="Team workspace" included={false} />
            </ul>
          </div>

          {/* ── Fund ── */}
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
                Best for funds &amp; teams
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#6366f1" }}>Fund</p>
              <div className="flex items-end gap-1 mb-0.5">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "white", letterSpacing: "-0.03em" }}>$299</span>
                <span className="text-sm mb-1.5" style={{ color: "#6b7280" }}>/month</span>
              </div>
              <p className="text-sm" style={{ color: "#6b7280" }}>
                Or{" "}
                <span className="font-semibold" style={{ color: "#a78bfa" }}>$2,870/year</span>
                {" "}— save 20%
              </p>
            </div>

            <Link href="/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 mb-6"
              style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}>
              Start 14-day free trial →
            </Link>

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#4b5563" }}>Everything in Pro, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="Unlimited wallet addresses" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="All chains" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Search all receivers" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Calendar integration" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Team workspace" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Slack webhook notifications" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Telegram & WhatsApp alerts" color="#e5e7eb" checkColor="#10b981" />
              <FeatureItem text="Priority support" color="#e5e7eb" checkColor="#10b981" />
            </ul>
          </div>
        </div>

        {/* Enterprise nudge */}
        <p className="text-center text-sm mt-8" style={{ color: "#94a3b8" }}>
          Managing a larger portfolio or need custom integrations?{" "}
          <ContactTrigger />
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
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#6366f1" }}>Fund</span>
            </div>

            {([
              ["Wallet addresses",              "1",       "5 wallets",       "Unlimited"],
              ["Blockchains",                   "1 chain", "5 chains",        "All chains"],
              ["Real-time dashboard",           true,      true,              true],
              ["Claimable balance tracking",    true,      true,              true],
              ["Unlock calendar",               true,      true,              true],
              ["Email alerts",                  false,     true,              true],
              ["Token Vesting Explorer",        false,     true,              true],
              ["CSV & PDF export",               false,     true,              true],
              ["Calendar integration",          false,     false,             true],
              ["Search all receivers",          false,     false,             true],
              ["Team workspace",                false,     false,             true],
              ["Slack webhook",                 false,     false,             true],
              ["Telegram & WhatsApp alerts",    false,     false,             true],
              ["Support",                       false,     "Ticketing",       "Priority"],
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
              a="No. The Free plan requires no payment details at all. Pro and Fund plans include a 14-day free trial — also card-free. You only need to add a card when you decide to continue."
            />
            <FAQItem
              q="What happens after the trial ends?"
              a="If you don't add a payment method your account automatically downgrades to the Free plan. You keep your data and can upgrade again at any time."
            />
            <FAQItem
              q="Can I cancel anytime?"
              a="Yes — cancel from your settings page at any time. You'll retain access until the end of your current billing period, then revert to Free."
            />
            <FAQItem
              q="How does annual billing work?"
              a="Annual billing is charged upfront for 12 months at a 20% discount — Pro is $191.90/year (~$16/mo) and Fund is $2,870/year (~$239/mo). You can switch between monthly and annual at renewal."
            />
            <FAQItem
              q="What's the difference between Pro and Fund?"
              a="Pro is built for individuals managing a few wallets who want email alerts and multi-chain coverage. Fund adds everything a team needs: calendar sync, Slack webhooks, CSV exports, team workspace, and comprehensive portfolio analytics."
            />
            <FAQItem
              q="Can the Fund plan support more than one user?"
              a="Yes — the Fund plan includes a shared team workspace. Need custom seats or enterprise features? Get in touch and we'll work something out."
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
            <Link href="/login"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white" }}>
              Start for free →
            </Link>
            <Link href="/login"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}>
              Try Pro free for 14 days →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t px-8 py-6 flex items-center justify-between flex-wrap gap-4"
        style={{ borderColor: "rgba(0,0,0,0.07)", background: "#f8fafc" }}>
        <p className="text-xs" style={{ color: "#94a3b8" }}>© 2026 Vestream. All rights reserved.</p>
        <div className="flex items-center gap-5">
          <Link href="/privacy" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>Privacy Policy</Link>
          <Link href="/terms" className="text-xs transition-colors hover:opacity-80" style={{ color: "#94a3b8" }}>Terms of Service</Link>
        </div>
      </footer>

    </div>
  );
}
