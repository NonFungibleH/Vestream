// Metadata wrapper for the /early-access route. The page itself is a client
// component (`"use client"` for the multi-step form state machine), and Next.js
// disallows `export const metadata` from client components — so we put it in a
// layout.tsx alongside, which Next.js merges into the route's <head>.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title:       "Early Access — Vestream Token Vesting Tracker",
  description: "Get early access to Vestream — the free tracker for every token vesting and unlock across 9 protocols. Sign up in 30 seconds.",
  alternates:  { canonical: "https://vestream.io/early-access" },
  openGraph: {
    title:       "Early Access — Vestream Token Vesting Tracker",
    description: "Get early access to Vestream — track every token unlock across 9 protocols. Free, no credit card.",
    url:         "https://vestream.io/early-access",
    siteName:    "Vestream",
    type:        "website",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "Early Access — Vestream Token Vesting Tracker",
    description: "Get early access to Vestream — track every token unlock across 9 protocols. Free, no credit card.",
  },
};

export default function EarlyAccessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
