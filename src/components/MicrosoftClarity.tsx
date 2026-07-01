"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const STORAGE_KEY = "vestream-cookie-consent";
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

/**
 * Microsoft Clarity loader – heatmaps, session replay, and rage-click /
 * dead-click detection. Free forever; no per-event quota.
 *
 * Privacy: Clarity auto-redacts every form field and any element marked
 * `data-clarity-mask="true"`. We still gate it behind the same cookie-consent
 * check as GA so users who choose "essential only" never get any client-side
 * recording.
 *
 * Setup: create a free project at https://clarity.microsoft.com, copy the
 * 10-character Project ID, set `NEXT_PUBLIC_CLARITY_ID` in Vercel.
 */
export default function MicrosoftClarity() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    function check() {
      try {
        setEnabled(window.localStorage.getItem(STORAGE_KEY) === "all");
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

  if (!enabled || !CLARITY_ID) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_ID}");
      `}
    </Script>
  );
}
