import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";
import GoogleAnalytics from "@/components/GoogleAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";

// Single source of truth for the headline copy used across <title>, <meta
// description>, OG and Twitter cards. Keeping these as constants makes it
// obvious when one card drifts from another (the sin we just paid for —
// Twitter and OG had subtly different descriptions before this commit).
const SITE_TITLE       = "Vestream — Free Token Vesting Tracker for 9 Protocols";
const SITE_DESCRIPTION =
  "Track every token unlock across 9 protocols (Sablier, Hedgey, UNCX, Streamflow + more) on Ethereum, Base, BNB, Polygon and Solana. Free, no signup.";

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
    site: "@vestream_io",
    creator: "@vestream_io",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <CookieBanner />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
