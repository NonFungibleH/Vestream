import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export default function Privacy() {
  return (
    <div className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-16"
        style={{ background: "white", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <span className="font-bold text-base tracking-tight" style={{ color: "#0f172a" }}>TokenVest</span>
        </Link>
        <Link href="/" className="text-sm font-medium transition-colors" style={{ color: "#64748b" }}>
          ← Back to home
        </Link>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>Legal</p>
          <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>Privacy Policy</h1>
          <p className="text-sm" style={{ color: "#94a3b8" }}>Last updated: January 2026</p>
        </div>

        <div className="rounded-2xl p-8 space-y-8"
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

          <Section title="1. Overview">
            TokenVest (&quot;we&quot;, &quot;our&quot;, or &quot;the service&quot;) is a read-only token vesting dashboard. We are committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights in relation to it.
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect the following minimal information:</p>
            <ul>
              <li><strong>Ethereum wallet addresses</strong> — you provide these to track vesting schedules. They are stored to power your dashboard.</li>
              <li><strong>Session data</strong> — a cryptographic session token is stored in an encrypted cookie after you sign in with Ethereum (SIWE). This does not include your private key.</li>
              <li><strong>Email address</strong> — optionally provided if you enable unlock notifications. Used solely to send vesting alerts.</li>
            </ul>
            <p>We do <strong>not</strong> collect passwords, private keys, seed phrases, or any financial credentials.</p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul>
              <li>To display your vesting positions from on-chain data via public subgraphs and RPC nodes.</li>
              <li>To authenticate your session via Sign-In with Ethereum (EIP-4361).</li>
              <li>To send you email notifications about upcoming token unlocks, if you opt in.</li>
            </ul>
            We do not sell, rent, or share your information with third parties for marketing purposes.
          </Section>

          <Section title="4. On-Chain Data">
            All vesting data displayed in TokenVest is sourced from public blockchain networks (Ethereum, Base, BSC) and protocol subgraphs. This data is inherently public. We do not store or cache vesting stream data on our servers beyond your session.
          </Section>

          <Section title="5. Cookies & Sessions">
            We use a single encrypted HTTP-only session cookie to maintain your authenticated session. This cookie does not track you across sites and expires when you sign out or after a period of inactivity.
          </Section>

          <Section title="6. Third-Party Services">
            <p>TokenVest uses the following third-party infrastructure:</p>
            <ul>
              <li><strong>Alchemy</strong> — for Ethereum, Base, and BSC RPC access. Alchemy&apos;s privacy policy applies to RPC requests.</li>
              <li><strong>The Graph</strong> — for querying Sablier, Hedgey, Team Finance, and UNCX protocol data via subgraphs.</li>
              <li><strong>Supabase</strong> — for storing wallet addresses and user preferences. Data is hosted in the EU (AWS eu-west-1).</li>
              <li><strong>Resend</strong> — for transactional email delivery, if you enable notifications.</li>
            </ul>
          </Section>

          <Section title="7. Data Retention">
            Your wallet addresses and preferences are retained until you delete your account or remove them from the dashboard. Email addresses for notifications are deleted upon unsubscribe. Session cookies expire after 7 days of inactivity.
          </Section>

          <Section title="8. Your Rights">
            <p>You have the right to:</p>
            <ul>
              <li>Access the data we hold about you.</li>
              <li>Delete your data at any time by removing your wallets from the dashboard.</li>
              <li>Opt out of email notifications at any time.</li>
              <li>Request full data deletion by contacting us.</li>
            </ul>
          </Section>

          <Section title="9. Security">
            Session cookies are encrypted using industry-standard algorithms. We do not have access to your private keys or the ability to initiate transactions on your behalf. TokenVest is strictly read-only.
          </Section>

          <Section title="10. Changes to This Policy">
            We may update this Privacy Policy from time to time. We will notify users of material changes via the dashboard. Continued use of the service after changes constitutes acceptance of the updated policy.
          </Section>

          <Section title="11. Contact">
            For privacy-related requests or questions, please contact us at{" "}
            <a href="mailto:privacy@vestream.io" style={{ color: "#2563eb" }}>privacy@vestream.io</a>.
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
      <h2 className="text-base font-bold mb-3" style={{ color: "#0f172a" }}>{title}</h2>
      <div className="text-sm leading-relaxed space-y-2" style={{ color: "#475569" }}>
        {typeof children === "string" ? <p>{children}</p> : children}
      </div>
    </div>
  );
}

