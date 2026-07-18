import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { AppStoreBadges } from "@/components/AppStoreBadges";

// /early-access — "Get the app" landing.
// ─────────────────────────────────────────────────────────────────────────────
// History: this was the web email→OTP sign-in/waitlist page. Web-side OTP was
// removed in Phase 5 (commit 8ad08dd, "rip web OTP/SIWE") — the /api/auth/email
// route it POSTed to no longer exists, so the old form was a guaranteed 404
// dead-end for every submitter. Web sign-in is now QR-pairing only (Pro), and
// ALL sign-ups + payments happen in the iOS/Android app via IAP.
//
// Rather than repoint the ~14 inbound links (pricing CTAs, /demo, /resources,
// /faq, AND the find-vestings confirmation email's "iOS/Android" buttons), this
// page is now the single canonical "get the app" destination — so every one of
// those links lands somewhere correct. See the funnel-fix commit.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title:       "Get Vestream – Free Token-Unlock Tracker for iOS & Android",
  description: "Download Vestream free on the App Store and Google Play. Track every token unlock across 10 vesting protocols and 8 chains — no account, no KYC. Upgrade to Pro in-app for unlimited alerts, the web dashboard, and tax exports.",
  alternates:  { canonical: "https://www.vestream.io/early-access" },
  openGraph: {
    title:       "Get Vestream – Free Token-Unlock Tracker for iOS & Android",
    description: "Download free on the App Store and Google Play. Track every token unlock — no account, no KYC. Pro unlocks unlimited alerts, the web dashboard, and tax exports.",
    url:         "https://www.vestream.io/early-access",
    siteName:    "Vestream",
    type:        "website",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Get Vestream – Free Token-Unlock Tracker for iOS & Android",
    description: "Download free on the App Store and Google Play. Track every token unlock — no account, no KYC.",
  },
};

const STEPS = [
  { n: "1", t: "Download the app", d: "Free on iOS and Android. Open it and you're ready — no account, no email, no KYC." },
  { n: "2", t: "Add any wallet", d: "Paste an EVM 0x… address or a Solana pubkey. We auto-scan it across every protocol and chain." },
  { n: "3", t: "Never miss an unlock", d: "Get a push before every cliff and unlock. Upgrade to Pro in-app for unlimited alerts, email, the web dashboard, and tax exports." },
];

export default function GetTheAppPage() {
  return (
    <div style={{ background: "#F5F5F3", minHeight: "100vh" }}>
      <SiteNav theme="light" />

      {/* Hero */}
      <section className="px-4 md:px-8 pt-14 md:pt-20 pb-12 md:pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6"
            style={{ background: "rgba(28,184,184,0.06)", borderColor: "rgba(28,184,184,0.2)", color: "#0F8A8A" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#1CB8B8" }} />
            Free · No account · No KYC
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
            Track every token unlock.
          </h1>
          <p className="text-base md:text-lg mb-8 leading-relaxed" style={{ color: "#8B8E92" }}>
            Vestream watches your vesting across 10 protocols and 8 chains, and
            tells you before every cliff and unlock. Get the free app to start.
          </p>

          <div className="flex flex-col items-center gap-4">
            <AppStoreBadges align="center" />
            <Link href="/find-vestings" className="text-sm font-semibold" style={{ color: "#0F8A8A" }}>
              Or search any wallet in your browser →
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 md:px-8 pb-16 md:pb-24">
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl p-6"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-4"
                style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A" }}>
                {s.n}
              </div>
              <h2 className="text-sm font-bold mb-1.5" style={{ color: "#1A1D20" }}>{s.t}</h2>
              <p className="text-sm leading-relaxed" style={{ color: "#8B8E92" }}>{s.d}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm mt-10" style={{ color: "#B8BABD" }}>
          Already Pro?{" "}
          <Link href="/login" className="font-semibold underline" style={{ color: "#0F8A8A" }}>
            Sign in to the web dashboard →
          </Link>
        </p>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
