// Confirmation page for the one-click unsubscribe link in web alert emails.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Unsubscribed · Vestream",
  // Never index an unsubscribe confirmation.
  robots: { index: false, follow: false },
};

export default async function Unsubscribed({
  searchParams,
}: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const success = ok !== "0";
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="ink" />
      <section className="flex-1 flex items-center justify-center px-4 md:px-8 py-24">
        <div className="max-w-md w-full text-center rounded-2xl p-8"
          style={{ background: "white", border: "1px solid rgba(21,23,26,0.09)", boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 10px 24px -14px rgba(16,24,40,0.16)" }}>
          <h1 className="text-2xl font-semibold mb-3" style={{ letterSpacing: "-0.03em" }}>
            {success ? "You're unsubscribed" : "Link not recognised"}
          </h1>
          <p className="text-sm leading-relaxed mb-7" style={{ color: "#5B6064" }}>
            {success
              ? "We won't email you about that wallet again. Nothing else changes, and you can start alerts again any time by scanning the wallet."
              : "That unsubscribe link has already been used or is no longer valid. If you're still receiving emails, reply to one and we'll sort it out."}
          </p>
          <Link href="/find-vestings"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", color: "white" }}>
            Check a wallet →
          </Link>
        </div>
      </section>
      <SiteFooter theme="light" />
    </div>
  );
}
