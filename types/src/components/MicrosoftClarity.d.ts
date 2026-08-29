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
export default function MicrosoftClarity(): import("react/jsx-runtime").JSX.Element | null;
