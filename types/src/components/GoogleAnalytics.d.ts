declare global {
    interface Window {
        gtag?: (...args: unknown[]) => void;
        dataLayer?: unknown[];
    }
}
export default function GoogleAnalytics(): import("react/jsx-runtime").JSX.Element | null;
