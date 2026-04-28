// src/app/dashboard/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Dashboard-tree layout. Single responsibility: wire the multi-currency
// provider so every USD-rendering component under /dashboard/* can call
// useCurrency() and re-render when the user switches currency in /settings.
//
// Server-side concerns:
//   - getRates() fetches USD-anchored FX rates (Upstash-cached 1h, falls
//     back to identity rates on provider failure so the page still renders)
//   - getCurrencyFromCookies() reads the user's saved choice for first-byte
//     SSR — avoids a hydration flash when the user has selected a non-USD
//     currency.
//
// The provider is a Client Component; this layout is a Server Component
// that prepares the props it needs.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { CurrencyProvider } from "@/lib/use-currency";
import { getRates, getCurrencyFromCookies } from "@/lib/currency";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [rateBundle, cookieStore] = await Promise.all([
    getRates(),
    cookies(),
  ]);
  const initialCurrency = getCurrencyFromCookies(cookieStore);

  return (
    <CurrencyProvider rates={rateBundle.rates} initialCurrency={initialCurrency}>
      {children}
    </CurrencyProvider>
  );
}
