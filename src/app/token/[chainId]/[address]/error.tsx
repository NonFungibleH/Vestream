"use client";

// Error boundary for the public token page. It exists so a transient data-load
// failure (cold Supabase pooler losing the overview-query timeout race) shows a
// graceful "try again" state instead of a bare 500 — AND, crucially, so the
// page component can THROW on a failed overview load without ISR caching an
// empty "No vesting activity" render (see page.tsx gatekeeper). On revalidation
// Next keeps serving the last good cached page, so this UI only ever surfaces on
// a first-ever blocking render that failed; a refresh almost always succeeds.

import { useEffect } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export default function TokenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[token-page] render error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div
          className="max-w-md w-full text-center rounded-2xl p-8"
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
        >
          <h1 className="text-xl font-bold mb-2" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            Couldn&apos;t load this token
          </h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: "#64748B" }}>
            We hit a hiccup fetching this token&apos;s vesting data — usually a momentary
            blip. Give it another try.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center px-4 rounded-xl text-sm font-semibold transition-all hover:opacity-90 min-h-[40px]"
              style={{ background: "#1CB8B8", color: "white", boxShadow: "0 2px 12px rgba(28,184,184,0.3)" }}
            >
              Try again
            </button>
            <Link
              href="/protocols"
              className="inline-flex items-center px-4 rounded-xl text-sm font-medium transition-colors hover:opacity-80 min-h-[40px]"
              style={{ color: "#64748B", border: "1px solid rgba(0,0,0,0.1)" }}
            >
              Browse protocols
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter theme="light" />
    </div>
  );
}
