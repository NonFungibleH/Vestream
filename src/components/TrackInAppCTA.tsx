"use client";

// TrackInAppCTA
// ─────────────────────────────────────────────────────────────────────────────
// "Track in app" CTA for the public find-vestings flow. Users on this page
// have just scanned a wallet and seen results — the next thing they want is
// "set and forget alerts on these in my pocket". We hand off context so the
// mobile app's add-wallet sheet pre-populates with the wallet they just saw.
//
// Behaviour:
//   - Builds a vestream://track?wallet=<addr> deep link
//   - Renders a primary CTA that targets the deep link
//   - Falls through to App Store if iOS doesn't open the app within 1500ms
//     (= app not installed; deferred install lands them on App Store with
//     the deep link preserved via the Universal Link manifest)
//
// Note: this is for the UNAUTHENTICATED public flow. The dashboard-side
// "Get the app" button (MobileAppBanner) goes through the magic-link bridge
// since the user is already signed in there.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { track } from "@/lib/analytics";

interface Props {
  walletAddress?: string;
  /** Optional token symbol context (e.g. "NOVA"). Mobile pre-fills add-wallet. */
  tokenSymbol?: string;
  /** Coarse surface tag for analytics — "find_vestings", "explore", etc. */
  surface: string;
  className?: string;
  /** Inline style passthrough so callers can match local theming without a CSS file. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const APP_STORE_URL = "https://apps.apple.com/app/id6739000000"; // updated post-EAS-submit

export function TrackInAppCTA({ walletAddress, tokenSymbol, surface, className, style, children }: Props) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    track("cta_clicked", {
      cta_id: "track_in_app",
      surface,
      has_wallet: !!walletAddress,
      has_token: !!tokenSymbol,
    });

    // Build the deep link. iOS Universal Links upgrade vestream:// to a
    // proper app handoff if the app is installed; if not, the timeout
    // below punts to the App Store.
    const params = new URLSearchParams();
    if (walletAddress) params.set("wallet", walletAddress);
    if (tokenSymbol)   params.set("token",  tokenSymbol);
    const deepLink = `vestream://track?${params.toString()}`;

    // Try the deep link first.
    window.location.href = deepLink;

    // If the app isn't installed, mobile Safari stays on the page — we punt
    // to the App Store. 1500ms is long enough that an installed app has
    // already foregrounded (so the App Store redirect is dropped by the
    // backgrounded tab) but short enough that a missing-app user isn't
    // staring at a stalled page.
    setTimeout(() => {
      if (document.hidden) return; // app opened, page backgrounded
      window.location.href = APP_STORE_URL;
    }, 1500);
  }, [walletAddress, tokenSymbol, surface]);

  return (
    <a
      href={`vestream://track?${new URLSearchParams({
        ...(walletAddress ? { wallet: walletAddress } : {}),
        ...(tokenSymbol   ? { token:  tokenSymbol  } : {}),
      }).toString()}`}
      onClick={handleClick}
      className={className}
      style={style}
    >
      {children ?? "Track in app →"}
    </a>
  );
}
