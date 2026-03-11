import Link from "next/link";

export default function Terms() {
  return (
    <div className="min-h-screen" style={{ background: "#f8fafc", color: "#0f172a" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-16"
        style={{ background: "white", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-bold text-base tracking-tight" style={{ color: "#0f172a" }}>Vestream</span>
        </Link>
        <Link href="/" className="text-sm font-medium transition-colors" style={{ color: "#64748b" }}>
          ← Back to home
        </Link>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#94a3b8" }}>Legal</p>
          <h1 className="text-4xl font-bold mb-3" style={{ letterSpacing: "-0.02em", color: "#0f172a" }}>Terms of Service</h1>
          <p className="text-sm" style={{ color: "#94a3b8" }}>Last updated: January 2026</p>
        </div>

        <div className="rounded-2xl p-8 space-y-8"
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

          <Section title="1. Acceptance of Terms">
            By accessing or using Vestream (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use the Service. Vestream reserves the right to update these terms at any time.
          </Section>

          <Section title="2. Description of Service">
            Vestream is a read-only token vesting dashboard that aggregates on-chain vesting data from multiple protocols (Sablier, Hedgey, Team Finance, UNCX) across Ethereum, Base, and BSC. The Service displays publicly available blockchain data and does not initiate, execute, or manage any blockchain transactions on your behalf.
          </Section>

          <Section title="3. Eligibility">
            You must be at least 18 years of age to use this Service. By using Vestream, you represent and warrant that you meet this requirement and that your use of the Service complies with all applicable laws and regulations in your jurisdiction.
          </Section>

          <Section title="4. Read-Only Access">
            <p>Vestream operates in a strictly read-only capacity. By using the Service:</p>
            <ul>
              <li>You acknowledge that Vestream cannot execute transactions, move funds, or interact with smart contracts on your behalf.</li>
              <li>Your private keys and seed phrases are never requested, collected, or stored.</li>
              <li>Authentication is performed via Sign-In with Ethereum (SIWE / EIP-4361), a cryptographic signature that proves wallet ownership without granting any permissions.</li>
            </ul>
          </Section>

          <Section title="5. No Financial Advice">
            The information provided by Vestream — including vesting schedules, token valuations, and unlock timelines — is for informational purposes only. Nothing in the Service constitutes financial, investment, legal, or tax advice. You should consult a qualified professional before making any financial decisions. Vestream makes no representations regarding the accuracy, completeness, or reliability of token price data or valuations displayed.
          </Section>

          <Section title="6. Accuracy of Data">
            Vestream sources data from public blockchains and protocol subgraphs operated by third parties. While we strive to display accurate information, we do not guarantee the completeness, accuracy, or timeliness of data. On-chain data may be subject to delays, re-orgs, or indexing lag. You agree that Vestream shall not be liable for any inaccuracies in data displayed.
          </Section>

          <Section title="7. User Responsibilities">
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service to violate any applicable law or regulation.</li>
              <li>Attempt to circumvent any technical measures or access restrictions.</li>
              <li>Use automated tools to scrape or excessively query the Service.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation.</li>
              <li>Use the Service in any manner that could damage, disable, or impair Vestream infrastructure.</li>
            </ul>
          </Section>

          <Section title="8. Intellectual Property">
            All content, branding, code, and design elements of Vestream are the property of Vestream and are protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without express written permission, except as permitted by applicable open-source licenses.
          </Section>

          <Section title="9. Third-Party Services">
            The Service integrates with third-party services including Alchemy, The Graph, Supabase, and Resend. Your use of these services is subject to their respective terms of service and privacy policies. Vestream is not responsible for the availability or accuracy of third-party services.
          </Section>

          <Section title="10. Disclaimer of Warranties">
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. VESTR DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
          </Section>

          <Section title="11. Limitation of Liability">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VESTR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF VESTR HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </Section>

          <Section title="12. Termination">
            Vestream reserves the right to suspend or terminate your access to the Service at any time, for any reason, without notice. You may also terminate your use of the Service at any time by signing out and removing your data.
          </Section>

          <Section title="13. Governing Law">
            These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising from these Terms or your use of the Service shall be resolved through binding arbitration or in the courts of competent jurisdiction, as applicable.
          </Section>

          <Section title="14. Contact">
            If you have questions about these Terms, please contact us at{" "}
            <a href="mailto:legal@vestream.io" style={{ color: "#2563eb" }}>legal@vestream.io</a>.
          </Section>
        </div>
      </div>

      <Footer />
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

function Footer() {
  return (
    <footer className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between"
      style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
      <p className="text-xs" style={{ color: "#94a3b8" }}>© 2026 Vestream. All rights reserved.</p>
      <div className="flex items-center gap-5">
        <Link href="/privacy" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Privacy Policy</Link>
        <Link href="/terms" className="text-xs hover:underline" style={{ color: "#94a3b8" }}>Terms of Service</Link>
      </div>
    </footer>
  );
}
