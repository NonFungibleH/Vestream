import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";

// Vestream brand fonts (per brand brief §05).
//
// Inter Tight — every human-readable string. Display headlines run with
// negative letter-spacing (-0.025em at H1/H2, -0.045em on the wordmark);
// see Tailwind config + globals.css for the per-level rules.
//
// JetBrains Mono — every number, address, code snippet, eyebrow label.
// Loaded with the `tabular-nums` feature flag so digit columns don't
// jitter as values update.
//
// No third typeface. System fallbacks are `system-ui` and `ui-monospace`
// — see globals.css.
const interTight = Inter_Tight({
  variable: "--font-sans",
  subsets:  ["latin"],
  weight:   ["400", "500", "600", "700"],
  display:  "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets:  ["latin"],
  weight:   ["400", "500"],
  display:  "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";

export const metadata: Metadata = {
  title: "Vestream – Token Vesting Tracker",
  description:
    "One dashboard for all your vesting positions — across Sablier, Hedgey, UNCX, and Unvest on Ethereum, Base, and BSC. Real-time data, email alerts, and a beautiful interface.",
  metadataBase: new URL(APP_URL),
  manifest: "/manifest.json",
  applicationName: "Vestream",
  appleWebApp: {
    capable:     true,
    title:       "Vestream",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon-16.png",  sizes: "16x16",   type: "image/png" },
      { url: "/favicon-32.png",  sizes: "32x32",   type: "image/png" },
      { url: "/favicon-48.png",  sizes: "48x48",   type: "image/png" },
      { url: "/icon-192.png",    sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png",    sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon",   url: "/logo-icon.svg", color: "#1CB8B8" },
    ],
  },
  openGraph: {
    title: "Vestream – Token Vesting Tracker",
    description:
      "One dashboard for all your vesting positions — across Sablier, Hedgey, UNCX, and Unvest on Ethereum, Base, and BSC. Real-time data, email alerts, and a beautiful interface.",
    url: APP_URL,
    siteName: "Vestream",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vestream – Token Vesting Tracker",
    description:
      "One dashboard for all your vesting positions. Real-time data, email alerts, and a beautiful interface.",
  },
};

export const viewport = {
  themeColor: "#1A1D20",   // ink — matches brand brief §04
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${interTight.variable} ${jetbrainsMono.variable} antialiased min-h-screen`}
        style={{ background: "var(--paper)", color: "var(--ink)" }}
      >
        <Providers>{children}</Providers>
        <CookieBanner />
      </body>
    </html>
  );
}
