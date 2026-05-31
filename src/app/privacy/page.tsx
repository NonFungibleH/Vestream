import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title:       "Privacy & Cookie Policy | Vestream",
  description: "How Vestream (operated by 3UILD LLC) handles your data across the website, dashboard, mobile app, developer API, and MCP server.",
  alternates:  { canonical: "https://www.vestream.io/privacy" },
};

export default function Privacy() {
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
          <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#1A1D20" }}>Privacy &amp; Cookie Policy</h1>
          <p className="text-sm" style={{ color: "#B8BABD" }}>Last updated: 11 May 2026</p>
        </div>

        <div className="rounded-2xl p-8 space-y-8"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

          <Section title="1. Who we are">
            <p>
              Vestream (&quot;Vestream&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;)
              is a token vesting tracking and indexing service. Vestream is owned and
              operated by{" "}
              <strong style={{ color: "#1A1D20" }}>3UILD LLC</strong>, a limited liability
              company. References to &quot;the Service&quot; in this policy include the
              Vestream website (vestream.io), the authenticated dashboard, the
              Vestream mobile app (iOS / Android), the developer REST API, and
              the Vestream Model Context Protocol (MCP) server.
            </p>
            <p>
              For questions about this policy or to exercise any of your rights
              described below, contact us at{" "}
              <a href="mailto:team@vestream.io" style={{ color: "#1CB8B8" }}>team@vestream.io</a>.
            </p>
          </Section>

          <Section title="2. Information we collect">
            <p>We collect only what we need to operate the Service. By category:</p>
            <ul>
              <li>
                <strong>Account identifiers.</strong> When you sign up via the
                mobile app, we store your email address as your account
                identifier. We authenticate sessions with a one-time code
                emailed to that address — no password, and we never request
                or store wallet keys. The desktop dashboard signs you in by
                scanning a QR code from the mobile app (Pro tier only); your
                phone authenticates the desktop session.
              </li>
              <li>
                <strong>Tracked wallet addresses.</strong> EVM (0x…) or Solana
                (base58) addresses you choose to monitor. These are stored so we
                can fetch their vesting positions on your behalf and notify you
                of upcoming unlocks. Wallet addresses are public on-chain data.
              </li>
              <li>
                <strong>Notification preferences.</strong> Email opt-in status,
                hours-before-unlock alert preference, and (for the mobile app)
                an Expo push token issued by your device.
              </li>
              <li>
                <strong>Subscription &amp; billing identifiers.</strong> If you purchase
                a paid plan, we store the corresponding RevenueCat customer
                and subscription ID. Card details are{" "}
                <strong style={{ color: "#1A1D20" }}>never</strong> stored on our
                infrastructure — they are handled by Apple App Store / Google Play
                via RevenueCat.
              </li>
              <li>
                <strong>Session data.</strong> A cryptographically signed,
                HTTP-only session cookie (web) or bearer token (mobile / API)
                used to keep you signed in.
              </li>
              <li>
                <strong>Developer API keys.</strong> If you apply for API access,
                we store your name, email, company name (optional), and a
                SHA-256 hash of any issued API keys. Plaintext keys are shown
                once and never stored.
              </li>
              <li>
                <strong>Analytics &amp; technical logs.</strong> If you accept analytics
                cookies, we collect anonymised page-view and event data via Google
                Analytics 4. Server logs (IP address, user agent, timestamp) are
                retained briefly for security and rate-limit enforcement.
              </li>
            </ul>
            <p>
              We do{" "}
              <strong style={{ color: "#1A1D20" }}>
                not collect passwords, private keys, seed phrases, or any
                signing credentials
              </strong>
              . The Service is read-only — we cannot move your tokens or sign
              transactions on your behalf.
            </p>
          </Section>

          <Section title="3. How we use your information">
            <ul>
              <li>To display vesting positions for the addresses you track.</li>
              <li>To authenticate your sessions across the website, mobile app, and developer API.</li>
              <li>To send you email or push notifications about upcoming unlock events, when you opt in.</li>
              <li>To process mobile subscription payments via RevenueCat (Apple App Store / Google Play) and to provision the corresponding service tier.</li>
              <li>To enforce rate limits and detect abuse of the Service.</li>
              <li>To analyse aggregate, anonymised usage of the Service to improve it (only when you accept analytics cookies).</li>
              <li>To respond to your support requests, legal requests, or rights requests.</li>
            </ul>
            <p>
              We do{" "}
              <strong style={{ color: "#1A1D20" }}>not</strong> sell your personal
              information. We do{" "}
              <strong style={{ color: "#1A1D20" }}>not</strong> share your personal
              information with third parties for their direct marketing.
            </p>
          </Section>

          <Section title="4. On-chain data and aggregated index">
            <p>
              Vestream maintains an aggregated, anonymised index of public
              vesting positions across the protocols and chains we support
              (Sablier, Hedgey, Superfluid, LlamaPay, UNCX, Unvest, PinkSale,
              Streamflow, Jupiter Lock — across Ethereum, BNB Chain,
              Polygon, Base, Arbitrum, Optimism, and Solana). This index is
              built from publicly available on-chain data and protocol
              subgraphs.
            </p>
            <p>
              On-chain data — including wallet balances, vesting schedules,
              token movements — is{" "}
              <strong style={{ color: "#1A1D20" }}>inherently public</strong> and
              does not become &quot;your data&quot; by virtue of you tracking a
              wallet on Vestream. We may use this aggregated, anonymised index
              to provide statistics, power public-facing pages (e.g. our
              /protocols and /unlocks calendar), expose it via our developer API
              and MCP server, and to operate and improve the Service. The
              presence of a wallet on our index does not imply ownership or
              control of that wallet by you.
            </p>
          </Section>

          <Section title="5. Cookies">
            <p>We use a small number of cookies, grouped by purpose:</p>
            <ul>
              <li>
                <strong>Essential.</strong> An encrypted, HTTP-only session
                cookie set when you sign in. Required to keep you signed in;
                cannot be disabled if you wish to use the dashboard.
              </li>
              <li>
                <strong>Analytics (optional).</strong> Google Analytics 4
                cookies, loaded only after you accept analytics in our cookie
                banner. Used for anonymised page-view and event reporting.
              </li>
            </ul>
            <p>
              We do{" "}
              <strong style={{ color: "#1A1D20" }}>not</strong> use any
              advertising or cross-site tracking cookies.
            </p>
          </Section>

          <Section title="6. Third-party processors">
            <p>The Service relies on the following sub-processors:</p>
            <ul>
              <li><strong>Supabase</strong> (Postgres database, EU region — AWS eu-west-1) — stores account, wallet, notification, and indexed-stream data.</li>
              <li><strong>Vercel</strong> — application hosting and edge CDN.</li>
              <li><strong>Upstash</strong> — Redis for rate limiting.</li>
              <li><strong>Resend</strong> — transactional email (sign-in OTP, unlock alerts).</li>
              <li><strong>Alchemy</strong> — Ethereum, Base, and Solana RPC.</li>
              <li><strong>BSC and Polygon RPC providers</strong> — chain reads.</li>
              <li><strong>The Graph</strong> — protocol subgraphs (Sablier, Hedgey, UNCX, Unvest, Superfluid).</li>
              <li><strong>DefiLlama</strong> — public TVL aggregates for select protocols.</li>
              <li><strong>DexScreener</strong> and <strong>CoinGecko</strong> — token price data for USD-equivalents shown in the dashboard.</li>
              <li><strong>RevenueCat</strong> + <strong>Apple App Store / Google Play</strong> — mobile in-app purchases.</li>
              <li><strong>Google Analytics 4</strong> — anonymised analytics, only with your consent.</li>
              <li><strong>Sentry</strong> (if enabled) — error reporting; configured to scrub personal data.</li>
            </ul>
            <p>
              Each third party operates under its own privacy policy. We
              maintain a current list of sub-processors and will publish
              changes here.
            </p>
          </Section>

          <Section title="7. International transfers">
            <p>
              3UILD LLC is established in the United States. Personal data we
              hold may be processed in the United States, the European Union
              (Supabase EU region), or wherever our sub-processors operate. We
              rely on the Standard Contractual Clauses or equivalent
              safeguards for international transfers where required.
            </p>
          </Section>

          <Section title="8. Data retention">
            <ul>
              <li>Account email + tracked wallets: retained until you delete your account or remove the wallets.</li>
              <li>Notification preferences: retained until you turn off notifications or delete your account.</li>
              <li>Subscription identifiers: retained for the lifetime of the subscription plus any period required by tax / accounting law.</li>
              <li>Server logs: 30 days unless required for security investigations.</li>
              <li>Aggregated, anonymised index data: retained indefinitely as part of the Service&apos;s public dataset.</li>
              <li>API key hashes: until you or we revoke the key.</li>
            </ul>
          </Section>

          <Section title="9. Your rights">
            <p>
              Depending on where you live, you may have the right to: access,
              correct, delete, port, or restrict processing of your personal
              data; withdraw consent for analytics; object to processing based
              on legitimate interest; and lodge a complaint with your data
              protection authority.
            </p>
            <p>
              To exercise any of these, email{" "}
              <a href="mailto:team@vestream.io" style={{ color: "#1CB8B8" }}>team@vestream.io</a>.
              We will respond within 30 days.
            </p>
            <p>
              You can also delete your tracked wallets and notification
              preferences directly from the dashboard at any time, or
              unsubscribe from emails using the link in any notification email.
            </p>
          </Section>

          <Section title="10. Children">
            <p>
              The Service is not directed at children under 13 (or under 16 in
              the EEA). We do not knowingly collect personal data from
              children. If you believe a child has provided us with personal
              data, please contact us and we will delete it.
            </p>
          </Section>

          <Section title="11. Security">
            <p>
              We use industry-standard measures to protect your data: TLS for
              all traffic, encrypted session cookies, hashed API keys, role-
              based access to production systems, and least-privilege database
              roles. No system is perfectly secure; we cannot guarantee absolute
              security but we work to reduce risk continuously.
            </p>
            <p>
              We cannot access your private keys and cannot initiate
              transactions on your behalf. The Service is read-only.
            </p>
          </Section>

          <Section title="12. Changes to this policy">
            <p>
              We may update this Privacy &amp; Cookie Policy from time to time.
              When we make material changes, we will update the &quot;Last
              updated&quot; date at the top, and notify active users via email
              or in-app notice. Continued use of the Service after a change
              constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="13. Contact">
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
