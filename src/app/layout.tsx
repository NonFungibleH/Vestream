import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import MicrosoftClarity from "@/components/MicrosoftClarity";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";

// iOS App Store ID — populated AFTER first eas submit when Apple assigns
// the 10-digit ID. Until set, the Smart App Banner meta tag is omitted
// entirely (rendering with a placeholder ID would surface a broken
// "Open" button in mobile Safari).
const IOS_APP_ID = process.env.NEXT_PUBLIC_IOS_APP_ID;

// Single source of truth for the headline copy used across <title>, <meta
// description>, OG and Twitter cards. Keeping these as constants makes it
// obvious when one card drifts from another (the sin we just paid for —
// Twitter and OG had subtly different descriptions before this commit).
// Title + description focus on the investor audience (vesting unlocks +
// tax-ready capital-gains exports). Payroll moved to the roadmap on
// May 5 2026 — the streaming-payment protocols (Sablier Flow, LlamaPay,
// Superfluid) are still indexed and visible inside the app for users
// who receive that kind of stream, but the marketing surface no longer
// leads with payroll-as-a-product. /payroll itself is a coming-soon
// waitlist page, linked from the footer; SEO for "crypto payroll
// tracker" parks there until we relaunch.
const SITE_TITLE       = "Vestream — Token Vesting Tracker · Push Alerts · Tax-ready Exports";
const SITE_DESCRIPTION =
  "Track every token vesting unlock you're owed across 9 protocols and 7 chains. Push alerts the moment a cliff hits, one-tap claim links, tax-ready CSV exports for Koinly, CoinTracker and TurboTax. Free, no signup.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  metadataBase: new URL(APP_URL),
  manifest: "/manifest.json",
  applicationName: "Vestream",
  alternates: { canonical: APP_URL },
  appleWebApp: {
    capable:     true,
    title:       "Vestream",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: APP_URL,
    siteName: "Vestream",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: "@Vestream_",
    creator: "@Vestream_",
  },
};

export const viewport = {
  themeColor: "#1CB8B8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Smart App Banner — Apple's built-in "Open in app" affordance for
          mobile Safari. Renders only when NEXT_PUBLIC_IOS_APP_ID is set
          (i.e. after first eas submit). app-argument carries the current
          page URL so the deep-link target opens the same content in the
          native app. */}
      {IOS_APP_ID && (
        <head>
          <meta
            name="apple-itunes-app"
            content={`app-id=${IOS_APP_ID}, app-argument=${APP_URL}`}
          />
        </head>
      )}
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground overflow-x-hidden`}
      >
        <Providers>{children}</Providers>
        <CookieBanner />
        {/* Analytics stack — each layer covers a different need:
              GoogleAnalytics    → traffic sources, demographics, custom events (cookie-gated)
              MicrosoftClarity   → heatmaps + session replay (cookie-gated, free, no quota)
              VercelAnalytics    → server-side pageviews, ad-blocker-proof, Web Vitals — no cookies
              SpeedInsights      → Core Web Vitals breakdown for performance budgets — no cookies
            Vercel layers don't gate on consent because they're aggregated /
            anonymised at the edge and don't drop a cookie. */}
        <GoogleAnalytics />
        <MicrosoftClarity />
        <VercelAnalytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
