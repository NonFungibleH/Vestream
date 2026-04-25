"use client";

import Link from "next/link";

/**
 * Plan CTA used on the pricing page.
 *
 * Web Stripe checkout was removed when we consolidated subscriptions onto
 * App Store / Google Play IAP via RevenueCat. The component now ALWAYS renders
 * a plain link — visitors who want to subscribe are routed to the mobile app
 * (or, for now, the early-access waitlist).
 */
interface PricingCtaProps {
  /** Button label */
  label: string;
  /** Destination — defaults to the early-access page */
  href?: string;
  /** Tailwind + inline style classNames forwarded to the rendered <a> */
  className?: string;
  style?: React.CSSProperties;
}

export default function PricingCta({
  label,
  href,
  className,
  style,
}: PricingCtaProps) {
  return (
    <Link href={href ?? "/early-access"} className={className} style={style}>
      {label}
    </Link>
  );
}
