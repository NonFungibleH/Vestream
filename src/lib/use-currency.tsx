// src/lib/use-currency.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side currency preference + live rate access.
//
// Architecture:
//   - User preference lives in localStorage (`vestream-currency`) and a
//     mirror cookie (`vestream-currency`) so server components can read it
//     too. Same pattern as src/lib/dark-mode.ts.
//   - FX rates are fetched once per page (server-side via getRates()) and
//     passed down through a small <CurrencyProvider> + this hook.
//   - Changing currency fires a `vestream:currency-changed` window event
//     so every <CurrencyAware> component re-renders without a route change.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";
import {
  type CurrencyCode,
  formatMoney,
  formatMoneyCompact,
  SUPPORTED_CURRENCIES,
} from "./currency";

const STORAGE_KEY  = "vestream-currency";
const COOKIE_KEY   = "vestream-currency";
const CHANGE_EVENT = "vestream:currency-changed";

interface CurrencyContextValue {
  /** Current currency code (USD by default) */
  currency: CurrencyCode;
  /** USD → currency multiplier (1 for USD, 0.79 for GBP, etc) */
  rate:     number;
  /** Set the user's currency choice — persists + dispatches event */
  setCurrency: (code: CurrencyCode) => void;
  /** Convenience formatters bound to the current currency + rate */
  format:        (usd: number | null | undefined) => string;
  formatCompact: (usd: number | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Server-fetched rates passed in at render time */
  rates: Record<string, number>;
  /** Server-detected initial currency (from cookie). Falls back to USD. */
  initialCurrency?: CurrencyCode;
}

/**
 * Wraps the dashboard / settings tree with currency state. Every
 * USD-rendering component reads from useCurrency() and re-renders when
 * the user picks a new currency in /settings.
 */
export function CurrencyProvider({ children, rates, initialCurrency }: ProviderProps) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(initialCurrency ?? "USD");

  // On first client render, prefer localStorage over the server-detected
  // initial (in case the user toggled in another tab between server render
  // and hydration).
  //
  // The eslint-disable below is intentional: the `react-hooks/set-state-in-
  // effect` rule discourages syncing setState in an effect, but for
  // SSR-safe localStorage hydration this IS the correct pattern. Lazy
  // useState() initialisers can't read localStorage without producing a
  // hydration mismatch (server renders with the cookie value, client would
  // render with localStorage value on first paint). Setting state inside
  // the post-mount effect is the React-blessed solution.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_CURRENCIES.some((c) => c.code === stored)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrencyState(stored as CurrencyCode);
      }
    } catch { /* localStorage disabled — use the prop default */ }

    function onChange(e: Event) {
      const detail = (e as CustomEvent<CurrencyCode>).detail;
      if (detail && SUPPORTED_CURRENCIES.some((c) => c.code === detail)) {
        setCurrencyState(detail);
      }
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
    try {
      document.cookie = `${COOKIE_KEY}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    } catch { /* ignore */ }
    setCurrencyState(code);
    window.dispatchEvent(new CustomEvent<CurrencyCode>(CHANGE_EVENT, { detail: code }));
  }, []);

  const rate = rates[currency] ?? 1;

  const value: CurrencyContextValue = {
    currency,
    rate,
    setCurrency,
    format:        (usd) => formatMoney(usd, currency, rate),
    formatCompact: (usd) => formatMoneyCompact(usd, currency, rate),
  };

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/** Hook for any USD-rendering component to read the user's chosen
 *  currency + the current rate + bound formatters. */
export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Reasonable fallback — components that aren't yet wrapped get USD.
    // This means we can roll out the provider gradually without breaking
    // pages that haven't been touched yet.
    return {
      currency:      "USD",
      rate:          1,
      setCurrency:   () => { /* no-op outside provider */ },
      format:        (usd) => formatMoney(usd, "USD", 1),
      formatCompact: (usd) => formatMoneyCompact(usd, "USD", 1),
    };
  }
  return ctx;
}

/**
 * Server-side helper: read the cookie to get the user's chosen currency.
 * Use in server components to render in the right currency on first byte.
 */
export function getCurrencyFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined },
): CurrencyCode {
  const v = cookieStore.get(COOKIE_KEY)?.value;
  if (!v) return "USD";
  if (SUPPORTED_CURRENCIES.some((c) => c.code === v)) return v as CurrencyCode;
  return "USD";
}
