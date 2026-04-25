import Link from "next/link";
import ContactTrigger from "@/components/ContactTrigger";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import PricingCta from "@/components/PricingCta";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Check({ color = "#2D8A4A" }: { color?: string }) {
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
      <circle cx="8" cy="8" r="8" fill="#B8BABD" fillOpacity={0.1} />
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
      <span style={{ color: included ? color : "#B8BABD", fontSize: "14px", lineHeight: 1.5 }}>{text}</span>
    </li>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-2xl border overflow-hidden"
      style={{ background: "white", borderColor: "rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none"
        style={{ color: "#1A1D20" }}>
        <span className="text-sm font-semibold">{q}</span>
        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-transform group-open:rotate-180"
          style={{ background: "rgba(28,184,184,0.08)", color: "#1CB8B8" }}>
          <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="px-6 pb-5 pt-1">
        <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>{a}</p>
      </div>
    </details>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Pricing() {
  // Web checkout removed — subscriptions are App Store IAP via RevenueCat only.
  // Pricing is shown for transparency; the CTA routes paying users to the
  // mobile app rather than to a web checkout.
  return (
    <div className="min-h-screen" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <SiteNav />

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center text-center px-6 pt-36 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle, rgba(21,23,26,0.10) 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top, rgba(28,184,184,0.07) 0%, transparent 65%)" }} />

        <div className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border mb-6 text-xs font-semibold"
          style={{ background: "rgba(28,184,184,0.06)", borderColor: "rgba(28,184,184,0.2)", color: "#1CB8B8" }}>
          Simple, transparent pricing
        </div>

        <h1 className="relative text-5xl font-bold tracking-tight mb-4 max-w-2xl"
          style={{ letterSpacing: "-0.03em", lineHeight: 1.1 }}>
          Start free.{" "}
          <span style={{ color: "#1CB8B8" }}>
            Scale when you&apos;re ready.
          </span>
        </h1>
        <p className="relative text-lg max-w-lg mb-2 leading-relaxed" style={{ color: "#8B8E92" }}>
          From solo investors to investment funds — a plan for every stage.
        </p>
      </section>

      {/* ── Pricing cards ────────────────────────────────────────────────────── */}
      <section className="relative px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* ── Free ── */}
          <div className="rounded-2xl p-7"
            style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#B8BABD" }}>Free</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>$0</span>
                <span className="text-sm mb-1.5" style={{ color: "#B8BABD" }}>/month</span>
              </div>
              <p className="text-sm" style={{ color: "#8B8E92" }}>Free forever. No credit card needed.</p>
            </div>

            <PricingCta
              href="/early-access"
              label="Get early access →"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 hover:opacity-90 mb-6"
              style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.2)", color: "#1CB8B8", textDecoration: "none" }}
            />

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#B8BABD" }}>Includes</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="1 wallet — auto-scanned across all chains" checkColor="#1CB8B8" />
              <FeatureItem text="All 9 vesting platforms (EVM + Solana)" checkColor="#1CB8B8" />
              <FeatureItem text="Real-time vesting dashboard" checkColor="#1CB8B8" />
              <FeatureItem text="Claimable balance tracking" checkColor="#1CB8B8" />
              <FeatureItem text="Unlock calendar" checkColor="#1CB8B8" />
              <FeatureItem text="Unlimited email alerts" checkColor="#1CB8B8" />
              <FeatureItem text="3 free push alerts (lifetime)" checkColor="#1CB8B8" />
              <FeatureItem text="Unlimited push alerts" included={false} />
              <FeatureItem text="Multiple wallets" included={false} />
            </ul>
          </div>

          {/* ── Pro ── (featured) */}
          <div className="relative rounded-2xl p-7"
            style={{
              background: "white",
              border: "2px solid #1CB8B8",
              boxShadow: "0 8px 32px rgba(28,184,184,0.18), 0 4px 12px rgba(21,23,26,0.10)",
            }}>
            {/* Badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "#1CB8B8", boxShadow: "0 4px 12px rgba(28,184,184,0.4)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                Most popular
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#1CB8B8" }}>Pro</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>$14.99</span>
                <span className="text-sm mb-1.5" style={{ color: "#B8BABD" }}>/month</span>
              </div>
              {/* Trial chip — earnest green to feel like a genuine benefit rather
                  than a pushy marketing flag. Sits under the price so the visitor
                  clocks "free trial" before "how much will this cost me". */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mb-2"
                style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "#059669" }}>
                14-day free trial
              </div>
              <p className="text-sm" style={{ color: "#8B8E92" }}>
                Or{" "}
                <span className="font-semibold" style={{ color: "#1CB8B8" }}>$119.99/year</span>
                {" "}— save 33%
              </p>
            </div>

            <PricingCta
              href="/early-access"
              label="Start 14-day free trial →"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 mb-6"
              style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.35)" }}
            />

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#B8BABD" }}>Everything in Free, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="3 wallet addresses" checkColor="#1CB8B8" />
              <FeatureItem text="Unlimited push alerts before every unlock" checkColor="#1CB8B8" />
              <FeatureItem text="Email unlock alerts" checkColor="#1CB8B8" />
              <FeatureItem text="Token Vesting Explorer — Discover any stream on-chain" checkColor="#1CB8B8" />
              <FeatureItem text="Priority data refresh (60s)" checkColor="#1CB8B8" />
              <FeatureItem text="CSV & PDF export" checkColor="#1CB8B8" />
              <FeatureItem text="Ticketing support" checkColor="#1CB8B8" />
              <FeatureItem text="Search all receivers" included={false} />
              <FeatureItem text="Team workspace" included={false} />
            </ul>
          </div>

          {/* ── Enterprise ── */}
          <div className="relative rounded-2xl p-7"
            style={{
              background: "#0d0f14",
              border: "1px solid rgba(45,138,74,0.3)",
              boxShadow: "0 4px 40px rgba(45,138,74,0.18), 0 24px 64px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}>
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                style={{ background: "#2D8A4A", boxShadow: "0 4px 12px rgba(45,138,74,0.4)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                Funds &amp; teams
              </span>
            </div>

            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#2D8A4A" }}>Enterprise</p>
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
              style={{ background: "#2D8A4A", boxShadow: "0 4px 16px rgba(45,138,74,0.35)", textDecoration: "none" }}
            />

            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#4b5563" }}>Everything in Pro, plus:</p>
            <ul style={{ display: "flex", flexDirection: "column", gap: "10px", listStyle: "none", padding: 0, margin: 0 }}>
              <FeatureItem text="Unlimited wallet addresses" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="Full REST API + MCP server access" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="Search all receivers" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="Team workspace &amp; shared portfolios" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="Slack webhook notifications" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="Telegram &amp; WhatsApp alerts" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="SSO &amp; custom SLA" color="#e5e7eb" checkColor="#2D8A4A" />
              <FeatureItem text="Dedicated support channel" color="#e5e7eb" checkColor="#2D8A4A" />
            </ul>
          </div>
        </div>

        {/* API nudge */}
        <p className="text-center text-sm mt-8" style={{ color: "#B8BABD" }}>
          Building on Vestream data?{" "}
          <Link href="/developer" className="font-semibold underline" style={{ color: "#1CB8B8" }}>
            See the Developer API →
          </Link>
        </p>
      </section>

      {/* ── Feature comparison table ──────────────────────────────────────────── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold text-center mb-8" style={{ color: "#1A1D20" }}>Compare plans</h2>

          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            {/* Header */}
            <div className="grid grid-cols-4 px-6 py-4"
              style={{ background: "#f1f5f9", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#B8BABD" }}>Feature</span>
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#B8BABD" }}>Free</span>
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#1CB8B8" }}>Pro</span>
              <span className="text-xs font-bold uppercase tracking-wider text-center" style={{ color: "#2D8A4A" }}>Enterprise</span>
            </div>

            {([
              ["Wallet addresses",              "1",               "3 wallets",     "Unlimited"],
              ["Auto-scan (all chains + platforms)", true,         true,            true],
              ["Real-time dashboard",           true,              true,            true],
              ["Claimable balance tracking",    true,              true,            true],
              ["Unlock calendar",               true,              true,            true],
              ["Push notifications",            "3 (lifetime)",    "Unlimited",     "Unlimited"],
              ["Email alerts",                  true,              true,            true],
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
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#1CB8B8" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#1CB8B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#B8BABD" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: "#374151" }}>{free}</span>
                  )}
                </div>
                {/* Pro */}
                <div className="flex justify-center">
                  {typeof pro === "boolean" ? (
                    pro
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#1CB8B8" fillOpacity={0.1}/><path d="M5 8l2 2 4-4" stroke="#1CB8B8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#B8BABD" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: "#1CB8B8" }}>{pro}</span>
                  )}
                </div>
                {/* Fund */}
                <div className="flex justify-center">
                  {typeof fund === "boolean" ? (
                    fund
                      ? <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#2D8A4A" fillOpacity={0.12}/><path d="M5 8l2 2 4-4" stroke="#2D8A4A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#B8BABD" fillOpacity={0.08}/><path d="M6 6l4 4M10 6l-4 4" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  ) : (
                    <span className="text-xs font-semibold text-center" style={{ color: "#2D8A4A" }}>{fund}</span>
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
          <h2 className="text-xl font-bold text-center mb-8" style={{ color: "#1A1D20" }}>Billing questions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <FAQItem
              q="Do I need a credit card to start?"
              a="No. The Free plan requires no payment details at all — just sign up with your email and start tracking. You only need to add a card when you choose to upgrade."
            />
            <FAQItem
              q="What does the Free plan actually let me do?"
              a="The Free plan auto-scans one wallet across every supported chain (including Solana) and all 9 vesting platforms — exactly the same data coverage as Pro. You get the full dashboard, unlock calendar, claimable tracking, unlimited email alerts, and 3 free push notifications (lifetime) to try mobile alerts. Pro unlocks unlimited push alerts, more wallets, the Token Vesting Explorer (Discover), and CSV/PDF export."
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
              a="Pro annual is charged upfront for 12 months at a 33% discount — $119.99/year (~$10/mo). You can switch between monthly and annual at renewal."
            />
            <FAQItem
              q="How does the 14-day free trial work?"
              a="New Pro signups get 14 days of full Pro access before any charge. Add a card to start the trial — we won't bill until day 15, and you can cancel anytime before then with one click. If you forget and we do charge, contact support within 48 hours for a full refund, no questions asked."
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
            background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)",
            boxShadow: "0 24px 64px rgba(15,23,42,0.22)",
          }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#1CB8B8" }}>Ready to start?</p>
          <h2 className="text-3xl font-bold mb-3 tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
            Never miss an unlock again.
          </h2>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: "#B8BABD" }}>
            Join investors and funds that use Vestream to stay on top of every vesting schedule.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/early-access"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white" }}>
              Start for free →
            </Link>
            <PricingCta
              href="/early-access"
              label="Upgrade to Pro →"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
              style={{ background: "#1CB8B8", boxShadow: "0 4px 20px rgba(28,184,184,0.4)" }}
            />
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
