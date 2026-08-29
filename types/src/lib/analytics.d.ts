declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
    }
}
export type AnalyticsEvent = "search_performed" | "wallet_scan_started" | "wallet_scan_completed" | "wallet_added" | "wallet_removed" | "stream_detail_viewed" | "notification_prefs_saved" | "signup_started" | "signup_completed" | "login_completed" | "early_access_requested" | "onboarding_step_completed" | "upgrade_clicked" | "subscription_started" | "subscription_canceled" | "api_access_requested" | "cta_clicked";
export type AnalyticsParams = Record<string, string | number | boolean | undefined>;
/**
 * Fire a custom analytics event. No-op until the user has accepted analytics
 * cookies AND the GA4 script has loaded. Safe to call from anywhere — server,
 * client, before or after hydration — without crashing.
 */
export declare function track(event: AnalyticsEvent, params?: AnalyticsParams): void;
/**
 * Detect the kind of input a search/scan started with so dashboards can
 * group "EVM scans vs Solana scans vs symbol searches" without the
 * tracking call site needing to know our regexes.
 */
export declare function classifyAddressOrQuery(input: string): "evm" | "solana" | "ens" | "symbol" | "freeform";
