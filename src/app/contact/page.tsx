// src/app/contact/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone /contact page — replacement for the old mailto link that used to
// live in the footer. Re-uses the existing /api/contact route (same POST
// shape as the ContactModal component), so CRM wiring happens in one place
// regardless of which surface submitted the form.
//
// Client component because the form needs local state (name, email, company,
// message, submission state). Server-rendered page wrapper below handles
// metadata/SEO; the ContactFormCard carries the interactivity.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ContactFormCard } from "./ContactFormCard";

export const metadata: Metadata = {
  title: "Contact — Vestream",
  description:
    "Get in touch with Vestream. Questions about the product, API access, Enterprise pricing, partnerships, or anything else — we reply within one business day.",
  alternates: { canonical: "https://vestream.io/contact" },
  openGraph: {
    title: "Contact Vestream",
    description:
      "Send us a message about the product, developer API, Enterprise pricing, or partnerships. We reply within one business day.",
    url: "https://vestream.io/contact",
    siteName: "Vestream",
    type: "website",
  },
};

// ContactPoint JSON-LD — surfaces a machine-readable contact method for
// search engines and AI agents. We deliberately don't expose a public email
// here (that gets scraped instantly); the form is the canonical channel.
const CONTACT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Vestream",
  url: "https://vestream.io",
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "Customer support",
      url: "https://vestream.io/contact",
      availableLanguage: ["English"],
    },
  ],
};

export default function ContactPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(CONTACT_JSON_LD) }}
      />

      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-10 md:pt-36 md:pb-12 px-4 md:px-8 text-center">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(28,184,184,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-2xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6"
            style={{
              background: "rgba(28,184,184,0.06)",
              borderColor: "rgba(28,184,184,0.2)",
              color: "#1CB8B8",
            }}
          >
            Get in touch
          </div>

          <h1
            className="font-bold tracking-tight mb-5"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#1A1D20",
            }}
          >
            Let&apos;s talk.
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed max-w-xl mx-auto"
            style={{ color: "#8B8E92" }}
          >
            Questions about the product, developer API access, Enterprise pricing,
            partnerships, or something we haven&apos;t thought of — we reply within
            one business day.
          </p>
        </div>
      </section>

      {/* ── Form + reason-to-contact grid ─────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 md:gap-10 items-start">
          {/* Form */}
          <ContactFormCard />

          {/* Why contact us — signals to visitor what this form is for */}
          <aside className="flex flex-col gap-4">
            <ReasonCard
              title="Enterprise pricing"
              body="Unlimited wallets, SSO, dedicated support, custom rate limits on the REST API. Tell us about your use case and we'll scope a plan."
            />
            <ReasonCard
              title="Developer API access"
              body="Request a production API key, discuss higher rate limits, or ask about webhook + streaming delivery (Enterprise roadmap)."
            />
            <ReasonCard
              title="Protocol integration"
              body="Building a vesting protocol and want it indexed by Vestream? Share your subgraph or contract details and we'll scope an adapter."
            />
            <ReasonCard
              title="Press & partnerships"
              body="Media enquiries, research collaborations, co-marketing. We're happy to provide data, quotes, or technical review for on-topic pieces."
            />
            <ReasonCard
              title="Support"
              body="Bug reports, account recovery, subscription questions, or anything the FAQ doesn't cover. We prioritise paying-customer issues but read everything."
              footer={
                <Link
                  href="/faq"
                  className="text-xs font-semibold inline-flex items-center gap-1 mt-1"
                  style={{ color: "#1CB8B8" }}
                >
                  Browse the FAQ first →
                </Link>
              }
            />
          </aside>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

function ReasonCard({
  title,
  body,
  footer,
}: {
  title:  string;
  body:   string;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "white",
        border: "1px solid rgba(21,23,26,0.10)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <h3
        className="text-sm font-bold mb-1.5"
        style={{ color: "#1A1D20", letterSpacing: "-0.01em" }}
      >
        {title}
      </h3>
      <p className="text-xs leading-relaxed" style={{ color: "#8B8E92" }}>
        {body}
      </p>
      {footer}
    </div>
  );
}
