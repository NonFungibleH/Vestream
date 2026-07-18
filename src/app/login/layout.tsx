import type { Metadata } from "next";

// /login is a client component (QR pairing polls in the browser), so it can't
// export `metadata` itself. This server-component layout supplies it — without
// it, /login inherited the homepage's default <title>/description, which is
// what people googling "vestream login" landed on (July 2026 audit).
export const metadata: Metadata = {
  title:       "Sign in – Vestream Web Dashboard",
  description: "Sign in to the Vestream web dashboard by scanning a QR code from the Vestream mobile app (Pro). No password. Don't have the app yet? Download it free on iOS and Android.",
  alternates:  { canonical: "https://www.vestream.io/login" },
  robots:      { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
