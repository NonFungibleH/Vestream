"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "vestream-cookie-consent";
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function check() {
      try {
        setEnabled(localStorage.getItem(STORAGE_KEY) === "all");
      } catch {
        setEnabled(false);
      }
    }
    check();
    window.addEventListener("vestream:consent-changed", check);
    window.addEventListener("storage", check);
    return () => {
      window.removeEventListener("vestream:consent-changed", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !GA_ID || typeof window.gtag !== "function") return;
    const url = pathname + window.location.search;
    window.gtag("config", GA_ID, { page_path: url });
  }, [enabled, pathname]);

  if (!enabled || !GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
