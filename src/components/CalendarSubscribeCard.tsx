"use client";

// ─────────────────────────────────────────────────────────────────────────────
// src/components/CalendarSubscribeCard.tsx
//
// Settings card surfacing the user's iCal subscribe URL with one-click
// "Add to Google / Apple / Outlook" deep links + a copy button + a rotate
// button.
//
// Calendar URL is sensitive-ish (anyone with the URL can read your unlock
// schedule). Initial state hides the URL behind a "Show" button – same
// pattern as masking API keys.
//
// Lives in /settings under the Notifications section since this is a
// notification surface (the calendar IS the alerts UI for users who'd
// rather not get push pings).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";

interface ManageResponse {
  token:         string;
  subscribeUrl:  string;
  webcalUrl:     string;
  createdAt:     string;
  lastFetchedAt: string | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function CalendarSubscribeCard() {
  const { data, isLoading } = useSWR<ManageResponse>(
    "/api/calendar/manage",
    fetcher,
    { revalidateOnFocus: false },
  );

  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyUrl() {
    if (!data?.subscribeUrl) return;
    try {
      await navigator.clipboard.writeText(data.subscribeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy – select the URL manually.");
    }
  }

  async function rotate() {
    if (!confirm("Rotate calendar URL? Calendar apps subscribed to the current URL will stop receiving updates.")) return;
    setRotating(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/manage", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      // Force SWR to refresh – the URL has changed.
      await globalMutate("/api/calendar/manage");
      setReveal(true); // show the new one immediately
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rotation failed");
    } finally {
      setRotating(false);
    }
  }

  // Google Calendar's "Add by URL" deep link. User pastes the URL into
  // Settings → Add calendar → From URL. We can't actually 1-click this on
  // Google's side (they require manual paste), but linking to the page +
  // having the URL pre-copied is the cleanest UX.
  const googleAddUrl = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

  if (isLoading) {
    return (
      <div className="text-xs" style={{ color: "var(--preview-text-3)" }}>
        Loading…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-xs" style={{ color: "#dc2626" }}>
        Failed to load calendar settings.
      </div>
    );
  }

  const masked = data.subscribeUrl.slice(0, 32) + "•".repeat(40);

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--preview-text-2)", lineHeight: 1.5 }}>
        Subscribe to your upcoming unlocks in Google Calendar, Apple Calendar, or Outlook.
        The calendar app polls this URL on its own schedule (~6 hours) and shows every cliff and unlock as a moment in your calendar.
      </p>

      {/* The URL – masked by default, reveal on click. Same pattern as
          masking API keys; the URL grants read access to your upcoming
          unlocks. */}
      <div
        className="rounded-xl p-3 flex items-center gap-2"
        style={{
          background: "var(--preview-card-2)",
          border: "1px solid var(--preview-border-2)",
        }}
      >
        <code
          className="text-[11px] font-mono break-all flex-1"
          style={{ color: "var(--preview-text)" }}
        >
          {reveal ? data.subscribeUrl : masked}
        </code>
        {!reveal ? (
          <button
            type="button"
            onClick={() => setReveal(true)}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0"
            style={{
              background: "rgba(28,184,184,0.10)",
              border:     "1px solid rgba(28,184,184,0.22)",
              color:      "#0F8A8A",
            }}
          >
            Show
          </button>
        ) : (
          <button
            type="button"
            onClick={copyUrl}
            className="text-[11px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0"
            style={{
              background: copied ? "rgba(15,138,74,0.15)" : "rgba(28,184,184,0.10)",
              border:     `1px solid ${copied ? "rgba(15,138,74,0.30)" : "rgba(28,184,184,0.22)"}`,
              color:      copied ? "#0F8A4A" : "#0F8A8A",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        )}
      </div>

      {/* Quick-add buttons – Apple Calendar handles webcal:// natively;
          Google needs manual paste so we link to the add-by-url page; for
          Outlook same idea. */}
      <div className="flex flex-wrap gap-2">
        <a
          href={data.webcalUrl}
          className="text-[11px] font-semibold px-3 py-2 rounded-md inline-flex items-center gap-1.5"
          style={{
            background: "rgba(28,184,184,0.10)",
            border:     "1px solid rgba(28,184,184,0.22)",
            color:      "#0F8A8A",
          }}
        >
          📅 Add to Apple Calendar
        </a>
        <a
          href={googleAddUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => { copyUrl(); }}
          className="text-[11px] font-semibold px-3 py-2 rounded-md inline-flex items-center gap-1.5"
          style={{
            background: "rgba(28,184,184,0.10)",
            border:     "1px solid rgba(28,184,184,0.22)",
            color:      "#0F8A8A",
          }}
          title="Opens Google Calendar's 'Add by URL' page. The subscribe URL is copied to your clipboard automatically – paste it there."
        >
          📅 Add to Google Calendar
        </a>
        <a
          href={`https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(data.subscribeUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold px-3 py-2 rounded-md inline-flex items-center gap-1.5"
          style={{
            background: "rgba(28,184,184,0.10)",
            border:     "1px solid rgba(28,184,184,0.22)",
            color:      "#0F8A8A",
          }}
        >
          📅 Add to Outlook
        </a>
      </div>

      {/* Diagnostic info + rotate button */}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
        <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
          {data.lastFetchedAt
            ? `Last polled by your calendar ${new Date(data.lastFetchedAt).toLocaleString()}`
            : "No calendar app has subscribed yet – click “Add to Calendar” above and your calendar will start polling on its own schedule."}
        </p>
        <button
          type="button"
          onClick={rotate}
          disabled={rotating}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md disabled:opacity-50"
          style={{
            background: "transparent",
            color: "#dc2626",
            border: "1px solid rgba(220,38,38,0.22)",
          }}
        >
          {rotating ? "Rotating…" : "Rotate URL"}
        </button>
      </div>

      {error && (
        <p className="text-[11px]" style={{ color: "#dc2626" }}>{error}</p>
      )}
    </div>
  );
}
