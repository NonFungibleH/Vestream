import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vestream.io";

export const metadata: Metadata = {
  title: "TokenVest – Token Vesting Tracker",
  description:
    "One dashboard for all your vesting positions — across Sablier, Hedgey, UNCX, and Unvest on Ethereum, Base, and BSC. Real-time data, email alerts, and a beautiful interface.",
  metadataBase: new URL(APP_URL),
  manifest: "/manifest.json",
  applicationName: "TokenVest",
  appleWebApp: {
    capable:     true,
    title:       "TokenVest",
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
    title: "TokenVest – Token Vesting Tracker",
    description:
      "One dashboard for all your vesting positions — across Sablier, Hedgey, UNCX, and Unvest on Ethereum, Base, and BSC. Real-time data, email alerts, and a beautiful interface.",
    url: APP_URL,
    siteName: "TokenVest",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TokenVest – Token Vesting Tracker",
    description:
      "One dashboard for all your vesting positions. Real-time data, email alerts, and a beautiful interface.",
  },
};

export const viewport = {
  themeColor: "#2563eb",
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
      </body>
    </html>
  );
}
