import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title:       "Terms of Service | Vestream",
  description: "Terms governing your use of Vestream — operated by 3UILD LLC. Covers the website, dashboard, mobile app, developer API, and MCP server.",
  alternates:  { canonical: "https://vestream.io/terms" },
};

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-16"
        style={{ background: "white", borderBottom: "1px solid rgba(21,23,26,0.10)" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7" />
          <span className="font-bold text-base tracking-tight" style={{ color: "#1A1D20" }}>Vestream</span>
        </Link>
        <Link href="/" className="text-sm font-medium transition-colors" style={{ color: "#8B8E92" }}>
          ← Back to home
        </Link>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#B8BABD" }}>Legal</p>
          <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>Terms of Service</h1>
          <p className="text-sm" style={{ color: "#B8BABD" }}>Last updated: April 2026</p>
        </div>

        <div className="rounded-2xl p-8 space-y-8"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

          <Section title="1. Operator">
            <p>
              The Vestream service is owned and operated by{" "}
              <strong style={{ color: "#1A1D20" }}>3UILD LLC</strong>{" "}
              (&quot;3UILD&quot;, &quot;Vestream&quot;, &quot;we&quot;,
              &quot;us&quot;, &quot;our&quot;). References to &quot;the
              Service&quot; in these Terms include the Vestream website
              (vestream.io), the authenticated dashboard, the Vestream mobile
              app (iOS and Android), the developer REST API, and the
              Vestream Model Context Protocol (MCP) server published as
              <code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.04)", padding: "0 0.25rem", borderRadius: 4 }}>@vestream/mcp</code>.
            </p>
          </Section>

          <Section title="2. Acceptance of Terms">
            <p>
              By accessing or using the Service you agree to be bound by these
              Terms of Service and our{" "}
              <Link href="/privacy" style={{ color: "#1CB8B8" }}>Privacy &amp; Cookie Policy</Link>.
              If you do not agree, do not use the Service. We may update these
              Terms from time to time; the &quot;Last updated&quot; date above
              tells you when. We will give reasonable notice of material
              changes.
            </p>
          </Section>

          <Section title="3. Description of Service">
            <p>
              Vestream is a read-only token-vesting tracker and developer
              data platform. We aggregate publicly available on-chain vesting
              data from supported protocols (currently Sablier, Hedgey,
              Superfluid, LlamaPay, UNCX, Unvest, PinkSale, Streamflow, and
              Jupiter Lock) across supported chains (Ethereum, BNB Chain,
              Polygon, Base, and Solana) and present it through the website,
              the mobile app, the developer API, and the MCP server. The
              Service does{" "}
              <strong style={{ color: "#1A1D20" }}>not</strong>{" "}
              custody your assets, sign transactions, manage funds, or provide
              investment, legal, or tax advice.
            </p>
          </Section>

          <Section title="4. Eligibility">
            <p>
              You must be at least 18 years old (or the age of majority in
              your jurisdiction) to use the Service. By using the Service, you
              represent that you meet this requirement and that your use
              complies with all applicable laws and sanctions (including, but
              not limited to, U.S. OFAC sanctions). You may not use the
              Service if you are located in, or are a resident or national
              of, any sanctioned country, or if you are listed on any
              government denied-party list.
            </p>
          </Section>

          <Section title="5. Account &amp; authentication">
            <p>
              You may create an account by signing in with your email
              address and a one-time password (OTP) sent to that address.
              You are responsible for keeping your email account secure and
              for all activity that occurs through your Vestream account. We
              never request and do not store your wallet private keys or
              seed phrases.
            </p>
            <p>
              For developer access, you may apply for an API key. Keys are
              issued at our discretion, may be rate-limited, and may be
              revoked at any time for breach of these Terms.
            </p>
          </Section>

          <Section title="6. Subscriptions, payments &amp; trials">
            <ul>
              <li>The Free tier requires no payment.</li>
              <li>The Pro tier is sold on the Vestream website via Stripe and on the Vestream mobile app via Apple In-App Purchase / Google Play Billing (managed by RevenueCat). Pricing on each surface is shown at the point of sale.</li>
              <li>The Enterprise tier is sold by contract; pricing and terms are provided separately.</li>
              <li>Free trials, where offered, automatically convert to paid subscriptions at the end of the trial period unless cancelled. You may cancel at any time before trial end via your account settings (web) or Apple / Google subscription settings (mobile).</li>
              <li>Subscriptions auto-renew at the end of each billing period unless cancelled. Refund eligibility follows the rules of the relevant payment processor (Stripe / Apple / Google).</li>
              <li>We may change subscription pricing for renewals with reasonable notice.</li>
            </ul>
          </Section>

          <Section title="7. Read-only nature of the Service">
            <p>
              Vestream is read-only. We display public on-chain data and
              forward you to protocol UIs to claim or interact with your
              positions. We do not initiate, sign, broadcast, or relay
              transactions on your behalf. Any link from Vestream to an
              external claim flow is a convenience link to a third-party
              application, and your interaction with that third party is
              governed by their terms.
            </p>
          </Section>

          <Section title="8. No financial, legal, or tax advice">
            <p>
              Information shown on the Service — including vesting
              schedules, USD valuations, unlock timelines, and aggregated
              statistics — is for informational purposes only. It is{" "}
              <strong style={{ color: "#1A1D20" }}>not</strong> investment,
              legal, accounting, or tax advice. Token values may be derived
              from third-party price oracles (DexScreener, CoinGecko) and
              may be inaccurate, especially for thinly-traded assets. You
              are solely responsible for any decisions you make.
            </p>
          </Section>

          <Section title="9. Accuracy of data">
            <p>
              We source data from public blockchains, protocol subgraphs,
              third-party RPC providers, and price aggregators. We use
              reasonable efforts to keep this data current and consistent
              but{" "}
              <strong style={{ color: "#1A1D20" }}>do not warrant</strong>{" "}
              its completeness, accuracy, or timeliness. On-chain data may
              be subject to indexing lag, chain re-orgs, third-party
              outages, or upstream errors. The Service is provided AS IS.
            </p>
          </Section>

          <Section title="10. Acceptable use">
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service in violation of any law, regulation, or sanctions program.</li>
              <li>Attempt to circumvent authentication, rate limits, or other technical controls.</li>
              <li>Scrape or systematically extract data from the Service except via the developer API under a valid key and within its published rate limits.</li>
              <li>Resell, redistribute, or sublicense data obtained through the Service in raw bulk form except as permitted by your tier or by separate written agreement with us.</li>
              <li>Use the Service to harass, defame, or violate the privacy of any person.</li>
              <li>Attempt to interfere with the Service&apos;s operation, including by submitting malware, denial-of-service traffic, or attempts to discover non-public APIs.</li>
              <li>Reverse-engineer the Service except to the extent permitted by applicable law.</li>
            </ul>
          </Section>

          <Section title="11. Vestream data &amp; intellectual property">
            <p>
              The Vestream brand, website design, source code, and the
              aggregated, normalised, enriched index of vesting data we
              produce (the &quot;Vestream Index&quot;) are owned by 3UILD
              LLC. While the Vestream Index is built from publicly
              available on-chain and third-party data, the curation,
              normalisation, schema, and quality controls applied to that
              data are protected by applicable copyright and database
              rights.
            </p>
            <p>
              Your tier (Free / Pro / Enterprise) grants you a personal,
              non-exclusive, non-transferable, revocable licence to use the
              Vestream Index and developer outputs solely for the use cases
              permitted by your tier. Bulk extraction or commercial
              redistribution requires an Enterprise agreement.
            </p>
          </Section>

          <Section title="12. Your data">
            <p>
              You retain all rights to the wallet addresses, notification
              preferences, and account information you provide. By using
              the Service, you grant us a worldwide, royalty-free licence
              to process, store, transmit, and display this data solely as
              necessary to operate and improve the Service in accordance
              with our{" "}
              <Link href="/privacy" style={{ color: "#1CB8B8" }}>Privacy &amp; Cookie Policy</Link>.
            </p>
            <p>
              On-chain data — wallet balances, vesting positions, token
              movements — is{" "}
              <strong style={{ color: "#1A1D20" }}>inherently public</strong> and
              not your property by virtue of you tracking a wallet on
              Vestream.
            </p>
          </Section>

          <Section title="13. Third-party services">
            <p>
              The Service relies on third-party infrastructure and data,
              including (without limitation) Supabase, Vercel, Upstash,
              Resend, Alchemy, The Graph, DefiLlama, DexScreener,
              CoinGecko, Stripe, RevenueCat, Apple App Store, Google Play,
              Google Analytics, and the third-party protocol contracts
              and subgraphs we integrate. Your use of those services is
              subject to their respective terms. We are not responsible for
              their availability, accuracy, or actions.
            </p>
          </Section>

          <Section title="14. Disclaimer of warranties">
            <p style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>
              The Service is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis without warranties of any kind, express
              or implied, including without limitation warranties of
              merchantability, fitness for a particular purpose, non-
              infringement, accuracy of data, or uninterrupted operation.
              We do not warrant that the Service will be free from errors,
              security vulnerabilities, or harmful components.
            </p>
          </Section>

          <Section title="15. Limitation of liability">
            <p style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>
              To the maximum extent permitted by law, in no event shall
              3UILD LLC, its members, officers, employees, or agents be
              liable for any indirect, incidental, special, consequential,
              exemplary, or punitive damages, including but not limited
              to loss of profits, loss of data, loss of goodwill, missed
              token unlocks, or failed claims, arising out of or in
              connection with your use of the Service. Our total
              cumulative liability to you for any claim arising out of or
              relating to the Service shall not exceed the greater of (a)
              the total fees you paid us in the twelve (12) months
              immediately preceding the claim, or (b) one hundred U.S.
              dollars ($100).
            </p>
          </Section>

          <Section title="16. Indemnity">
            <p>
              You agree to indemnify and hold 3UILD LLC harmless from any
              claim, demand, loss, or damage (including reasonable legal
              fees) arising out of or related to (a) your breach of these
              Terms, (b) your misuse of the Service, or (c) your
              violation of any law or third-party right.
            </p>
          </Section>

          <Section title="17. Termination">
            <p>
              We may suspend or terminate your access to the Service at
              any time, with or without notice, for any reason — including
              breach of these Terms, suspected abuse, or non-payment. You
              may terminate your account at any time by signing out and
              deleting your account from the dashboard. Sections that by
              their nature should survive termination — including
              Sections 11 (IP), 14 (warranties), 15 (liability), 16
              (indemnity), and 18 (governing law) — survive termination.
            </p>
          </Section>

          <Section title="18. Governing law &amp; disputes">
            <p>
              These Terms are governed by the laws of the State of
              Delaware, United States, without regard to its conflict of
              law principles. Any dispute arising out of or relating to
              these Terms or the Service shall be resolved exclusively
              by binding arbitration administered under the rules of the
              American Arbitration Association, except that either party
              may seek injunctive relief in any court of competent
              jurisdiction to protect its intellectual property rights.
              You and 3UILD agree that any arbitration shall be
              conducted on an individual basis only and not as a class
              or collective action.
            </p>
          </Section>

          <Section title="19. Contact">
            <p>
              3UILD LLC<br />
              Email:{" "}
              <a href="mailto:team@vestream.io" style={{ color: "#1CB8B8" }}>team@vestream.io</a>
            </p>
          </Section>
        </div>
      </div>

      <SiteFooter theme="light" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "1.5rem" }}>
      <h2 className="text-base font-bold mb-3" style={{ color: "#1A1D20" }}>{title}</h2>
      <div className="text-sm leading-relaxed space-y-2" style={{ color: "#475569" }}>
        {typeof children === "string" ? <p>{children}</p> : children}
      </div>
    </div>
  );
}
