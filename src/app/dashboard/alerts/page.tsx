"use client";

// /dashboard/alerts
// ─────────────────────────────────────────────────────────────────────────────
// Web alerts management — token-first, mirroring the mobile app's Alerts tab.
//
// 2026-06-15 rebuild: the page is now TOKEN-FIRST. You pick a token (stream)
// at the top, then see + configure that token's three alert slots below —
// exactly the mental model the mobile app uses. This replaced the old
// "global push defaults + a list of per-stream override rows" layout.
//
// Why the change went deeper than cosmetics:
//   - The notification scheduler (src/lib/notifications/scheduler.ts) REQUIRES
//     a per-stream prefs entry to send anything (`if (!perStream) continue` —
//     a 2026-05-20 privacy fix). The old page's prominent "Global push" event
//     toggles (notifyCliff / notifyStreamEnd / notifyMonthly / notifyNextClaim)
//     were read by ZERO firing code — dead UI implying alerts that never sent.
//     They're removed here. The only globals that still matter are the email
//     enable + address (kept below) and `hoursBeforeUnlock` (a stored default
//     timing, now set per-slot so it never needs a global control).
//   - So this page now reflects how the backend actually works: every alert is
//     per-stream and opt-in.
//
// Data model is shared with mobile: both write `streamPrefs[streamId]` (a JSONB
// bag keyed by streamId) — toggle on either surface, see it on both. Web writes
// via PUT /api/notifications/preferences; mobile via POST /api/mobile/notifications.
//
// Layout (top → bottom):
//   1. Header.
//   2. TOKEN SELECTOR — pills (≤4 active streams) or dropdown (>4), each with an
//      "armed" alert-count badge. Active = non-fully-vested.
//   3. SELECTED TOKEN CONFIG — 3 alert slots; each slot is a toggle + a trigger
//      picker (timing chips / event chips / value chips). Continuous streams
//      (Superfluid / LlamaPay) only offer value triggers.
//   4. EMAIL alerts (global enable + address).
//   5. TEST push.
//   6. HISTORY — last 50 notifications.
//
// Every trigger offered here is verified to fire in the scheduler:
//   before-unlock, vesting-start, cliff, stream-end (resolveAlertSpecs) and
//   threshold (its own branch). No dead toggles.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { useDarkMode } from "@/lib/use-dark-mode";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/components/Toast";

type TriggerType = "before-unlock" | "vesting-start" | "cliff" | "stream-end" | "threshold";

interface StreamSlotPref {
  enabled?:           boolean;
  triggerType?:       TriggerType;
  hoursBeforeUnlock?: number | null;
  thresholdUsd?:      number | null;
}

/** Local UI shape — flat per-slot. Server stores a per-slot scattered
 *  set of keys (alert1TriggerType, alert2TriggerType, thresholdUsd1…)
 *  for back-compat with the mobile-first schema; we normalise to/from
 *  this on read/write. */
interface StreamPref {
  enabled:           boolean;
  hoursBeforeUnlock: number | null;
  slots:             Record<1 | 2 | 3, StreamSlotPref>;
}

interface RawStreamPref {
  enabled?:            boolean;
  hoursBeforeUnlock?:  number | null;
  alert1Enabled?:      boolean;
  alert2Enabled?:      boolean;
  alert3Enabled?:      boolean;
  alert1TriggerType?:  TriggerType;
  alert2TriggerType?:  TriggerType;
  alert3TriggerType?:  TriggerType;
  pushTiming2?:        number | null;
  pushTiming3?:        number | null;
  thresholdUsd1?:      number | null;
  thresholdUsd2?:      number | null;
  thresholdUsd3?:      number | null;
}

interface Prefs {
  emailEnabled:      boolean;
  email:             string | null;
  hoursBeforeUnlock: number;
  streamPrefs:       Record<string, RawStreamPref>;
}

interface Stream {
  id:             string;
  protocol:       string;
  chainId:        number;
  tokenSymbol:    string;
  tokenAddress:   string;
  isFullyVested:  boolean;
  startTime:      number | null;
  cliffTime:      number | null;
  endTime:        number | null;
  nextUnlockTime: number | null;
}

interface HistoryItem {
  id:           string;
  streamId:     string;
  tokenSymbol:  string;
  tokenAddress: string | null;
  chainId:      number | null;
  protocol:     string | null;
  isTest:       boolean;
  sentAt:       string;
  eventTime:    string;
}

// ── Trigger catalogue (mirrors the mobile app) ──────────────────────────────
// Timing options for "before-unlock". Fractional hours encode sub-hour
// lead times: 1/6 h = 10 min. The scheduler multiplies hoursBefore × 3600,
// so any positive number works.
const TIMING_OPTIONS: { hours: number; label: string }[] = [
  { hours: 0,     label: "Live" },
  { hours: 1 / 6, label: "10 min" },
  { hours: 1,     label: "1h" },
  { hours: 3,     label: "3h" },
  { hours: 6,     label: "6h" },
  { hours: 12,    label: "12h" },
  { hours: 24,    label: "24h" },
];
const VALUE_OPTIONS = [100, 500, 1000, 5000, 10000] as const;

const EVENT_TRIGGERS: TriggerType[] = ["vesting-start", "cliff", "stream-end"];
const EVENT_LABELS: Record<string, string> = {
  "vesting-start": "Vesting start",
  "cliff":         "Cliff",
  "stream-end":    "Stream end",
};

// Protocols with continuous (per-second) streaming and no discrete unlock —
// timing/event triggers don't apply, only value-crosses.
const CONTINUOUS_PROTOCOLS = new Set(["superfluid", "llamapay"]);

function timingLabel(hours: number): string {
  const opt = TIMING_OPTIONS.find((o) => Math.abs(o.hours - hours) < 1e-6);
  if (opt) return opt.hours === 0 ? "at unlock" : `${opt.label} before`;
  return `${hours}h before`;
}

/** Human summary of a single configured slot, for the collapsed slot subtitle. */
function slotSummary(slot: StreamSlotPref, fallbackHours: number): string {
  const trig = slot.triggerType ?? "before-unlock";
  if (trig === "threshold") {
    return slot.thresholdUsd != null ? `when claimable passes $${slot.thresholdUsd.toLocaleString()}` : "on a value threshold";
  }
  if (trig === "before-unlock") return timingLabel(slot.hoursBeforeUnlock ?? fallbackHours);
  if (trig === "vesting-start") return "when vesting begins";
  if (trig === "cliff")         return "at the cliff";
  if (trig === "stream-end")    return "when the stream ends";
  return "";
}

// ── Encoding / decoding raw streamPrefs ⇄ UI shape ──────────────────────────
// Server stores per-slot fields scattered (alert1*, alert2*, alert3*) so the
// JSON column matches the mobile schema. The UI is easier to reason about
// with one nested object per slot. Conversion is loss-less and bidirectional.

function decodeStreamPref(raw: RawStreamPref | undefined): StreamPref {
  return {
    enabled: raw?.enabled ?? true,
    hoursBeforeUnlock: raw?.hoursBeforeUnlock ?? null,
    slots: {
      1: {
        enabled:           raw?.alert1Enabled,
        triggerType:       raw?.alert1TriggerType,
        hoursBeforeUnlock: raw?.hoursBeforeUnlock,
        thresholdUsd:      raw?.thresholdUsd1,
      },
      2: {
        // Pre-2026-06 clients used pushTiming2 != null as the implicit
        // enable bit; honour that for legacy data so a Pro user who set
        // Alert 2 from the mobile app pre-fix doesn't see an empty slot.
        enabled:           raw?.alert2Enabled ?? (raw?.pushTiming2 != null),
        triggerType:       raw?.alert2TriggerType,
        hoursBeforeUnlock: raw?.pushTiming2,
        thresholdUsd:      raw?.thresholdUsd2,
      },
      3: {
        enabled:           raw?.alert3Enabled,
        triggerType:       raw?.alert3TriggerType,
        hoursBeforeUnlock: raw?.pushTiming3,
        thresholdUsd:      raw?.thresholdUsd3,
      },
    },
  };
}

function encodeStreamPref(pref: StreamPref): RawStreamPref {
  return {
    enabled: pref.enabled,
    hoursBeforeUnlock:   pref.slots[1].hoursBeforeUnlock ?? pref.hoursBeforeUnlock,
    alert1Enabled:       pref.slots[1].enabled ?? false,
    alert1TriggerType:   pref.slots[1].triggerType,
    thresholdUsd1:       pref.slots[1].thresholdUsd,
    alert2Enabled:       pref.slots[2].enabled ?? false,
    alert2TriggerType:   pref.slots[2].triggerType,
    pushTiming2:         pref.slots[2].hoursBeforeUnlock,
    thresholdUsd2:       pref.slots[2].thresholdUsd,
    alert3Enabled:       pref.slots[3].enabled ?? false,
    alert3TriggerType:   pref.slots[3].triggerType,
    pushTiming3:         pref.slots[3].hoursBeforeUnlock,
    thresholdUsd3:       pref.slots[3].thresholdUsd,
  };
}

function activeSlotCount(raw: RawStreamPref | undefined): number {
  if (!raw) return 0;
  if (raw.enabled === false) return 0; // muted
  let n = 0;
  if (raw.alert1Enabled) n++;
  if (raw.alert2Enabled || raw.pushTiming2 != null) n++;
  if (raw.alert3Enabled) n++;
  return n;
}

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (diff < 60)        return "just now";
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export default function AlertsPage() {
  const router = useRouter();
  const toast = useToast();
  const { dark: _dark } = useDarkMode();
  // `dark` is unused inside the markup (CSS vars own all theming via the
  // provider's wrapper) but we keep the hook call so the provider's
  // reactive subscription stays mounted — drops the lint warning without
  // changing behaviour.
  void _dark;

  const [savingId, setSavingId] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // SWR caches — each survives navigation away/back (60s dedupe via the
  // dashboard's SWRConfig provider), so revisiting /dashboard/alerts after a
  // short detour is instant. The fetcher pushes 401s through the /login bounce.
  const onAuthFail = useCallback(() => { router.push("/login"); }, [router]);
  const authFetcher = useCallback(async <T,>(url: string): Promise<T> => {
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 401) { onAuthFail(); throw new Error("unauthorized"); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  }, [onAuthFail]);

  const { data: prefsRaw, mutate: mutatePrefs } = useSWR<{ preferences: Partial<Prefs> | null }>(
    "/api/notifications/preferences",
    authFetcher,
  );
  // /api/vesting REQUIRES a `wallets` param — calling it bare returns 400.
  // Fetch the user's tracked wallets first, then build the scoped URL. No
  // wallets → skip the call (vestingUrl stays null) and the streams memo below
  // resolves to [] so the empty state shows.
  const { data: walletsRaw } = useSWR<{ wallets: { address: string }[] }>(
    "/api/wallets",
    authFetcher,
  );
  const walletAddresses = useMemo(
    () => (walletsRaw?.wallets ?? []).map((w) => w.address).join(","),
    [walletsRaw],
  );
  const vestingUrl = walletAddresses.length > 0
    ? `/api/vesting?wallets=${walletAddresses}`
    : null;
  const { data: streamsRaw } = useSWR<{ streams: (Stream & Record<string, unknown>)[] }>(
    vestingUrl,
    authFetcher,
  );
  const { data: historyRaw } = useSWR<{ items: HistoryItem[] }>(
    "/api/notifications/history?limit=50",
    authFetcher,
  );

  const prefs: Prefs | null = useMemo(() => {
    if (prefsRaw === undefined) return null;
    const p = prefsRaw.preferences ?? {};
    return {
      emailEnabled:      p.emailEnabled      ?? false,
      email:             p.email             ?? null,
      hoursBeforeUnlock: p.hoursBeforeUnlock ?? 24,
      streamPrefs:       p.streamPrefs       ?? {},
    };
  }, [prefsRaw]);

  const streams: Stream[] | null = useMemo(() => {
    // Wallets loaded but user has none → no streams to manage (empty state),
    // NOT a perpetual "Loading alerts…". Resolve to [] so the gate releases.
    if (walletsRaw !== undefined && walletAddresses.length === 0) return [];
    if (streamsRaw === undefined) return null;
    return (streamsRaw.streams ?? []).map((s) => ({
      id: s.id, protocol: s.protocol, chainId: s.chainId,
      tokenSymbol: s.tokenSymbol, tokenAddress: s.tokenAddress,
      isFullyVested: s.isFullyVested,
      startTime:      (s.startTime as number | null) ?? null,
      cliffTime:      (s.cliffTime as number | null) ?? null,
      endTime:        (s.endTime as number | null) ?? null,
      nextUnlockTime: (s.nextUnlockTime as number | null) ?? null,
    }));
  }, [streamsRaw, walletsRaw, walletAddresses]);

  const history: HistoryItem[] | null = useMemo(
    () => historyRaw === undefined ? null : (historyRaw.items ?? []),
    [historyRaw],
  );

  // Active (alertable) streams — non-fully-vested, like the mobile app.
  const activeStreams = useMemo(
    () => (streams ?? []).filter((s) => !s.isFullyVested),
    [streams],
  );

  // Labels: disambiguate duplicate token symbols with the protocol so two
  // NOVA grants on different protocols are tellable apart in the selector.
  const labelFor = useCallback((s: Stream): string => {
    const dupes = activeStreams.filter((x) => x.tokenSymbol === s.tokenSymbol).length;
    return dupes > 1 ? `${s.tokenSymbol} · ${s.protocol}` : s.tokenSymbol;
  }, [activeStreams]);

  // Deep-link (?stream=<id>) + auto-select first. Read from window so we don't
  // pull useSearchParams (which forces a Suspense boundary at build time).
  useEffect(() => {
    if (activeStreams.length === 0) return;
    setSelectedId((cur) => {
      if (cur && activeStreams.some((s) => s.id === cur)) return cur;
      const fromUrl = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("stream")
        : null;
      if (fromUrl && activeStreams.some((s) => s.id === fromUrl)) return fromUrl;
      return activeStreams[0].id;
    });
  }, [activeStreams]);

  const selectedStream = useMemo(
    () => activeStreams.find((s) => s.id === selectedId) ?? null,
    [activeStreams, selectedId],
  );

  // ── Persist a single stream's prefs ─────────────────────────────────────
  const saveStreamPref = useCallback(async (streamId: string, next: StreamPref) => {
    if (!prefs) return;
    setSavingId(streamId);
    setError(null);
    const encoded = encodeStreamPref(next);
    const merged: Record<string, RawStreamPref> = { ...prefs.streamPrefs, [streamId]: encoded };
    // Optimistic SWR update so the toggle/chip feels instant.
    mutatePrefs(
      (cur) => cur ? { preferences: { ...(cur.preferences ?? {}), streamPrefs: merged } } : cur,
      { revalidate: false },
    );
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamPrefs: merged }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? "Failed to save");
      }
      mutatePrefs((cur) => cur, { revalidate: true });
      toast.success("Alert saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      toast.error(msg);
      mutatePrefs((cur) => cur, { revalidate: true }); // roll back to server truth
    } finally {
      setSavingId(null);
    }
  }, [prefs, mutatePrefs, toast]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const streamById = useMemo(() => {
    const m = new Map<string, Stream>();
    for (const s of streams ?? []) m.set(s.id, s);
    return m;
  }, [streams]);

  const totalArmed = useMemo(() => {
    if (!prefs) return 0;
    return activeStreams.reduce((n, s) => n + activeSlotCount(prefs.streamPrefs[s.id]), 0);
  }, [prefs, activeStreams]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 w-full">
      {/* Breadcrumb + hero */}
      <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link>
        <span>/</span>
        <span>Alerts</span>
      </div>
      <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
        style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
        Alerts
      </div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1"
        style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
        Notification alerts
      </h1>
      <p className="text-sm mb-2" style={{ color: "var(--preview-text-2)" }}>
        Pick a token, then set exactly how you want to hear about it — before an unlock, at the cliff, at full vest, or when its claimable value crosses a number. Everything here is shared with the mobile app.
      </p>
      <div className="inline-flex items-center gap-1.5 mb-6 text-[11px]" style={{ color: "var(--preview-text-3)" }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: "#0F8A8A", display: "inline-block" }} />
        Synced with the Vestream mobile app
      </div>

      {error && (
        <div className="rounded-xl px-3 py-2 mb-4 text-xs"
          style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {(prefs === null || streams === null) && !error && (
        <div className="text-sm" style={{ color: "var(--preview-text-3)" }}>Loading alerts…</div>
      )}

      {prefs && streams && (
        <>
          {/* ── Token-first config ─────────────────────────────────────── */}
          {activeStreams.length === 0 ? (
            <NoStreamsBlock hasStreams={streams.length > 0} />
          ) : (
            <section className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
                  Your tokens
                </h2>
                {totalArmed > 0 && (
                  <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                    {totalArmed} alert{totalArmed === 1 ? "" : "s"} armed across {activeStreams.length} token{activeStreams.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <TokenSelector
                streams={activeStreams}
                selectedId={selectedId}
                streamPrefs={prefs.streamPrefs}
                labelFor={labelFor}
                onSelect={setSelectedId}
              />

              {selectedStream && (
                <div className="mt-4">
                  <StreamAlertConfig
                    key={selectedStream.id}
                    stream={selectedStream}
                    raw={prefs.streamPrefs[selectedStream.id]}
                    globalHours={prefs.hoursBeforeUnlock}
                    saving={savingId === selectedStream.id}
                    onSave={(next) => saveStreamPref(selectedStream.id, next)}
                  />
                </div>
              )}
            </section>
          )}

          {/* ── Email alerts (global) ────────────────────────────────────── */}
          <GlobalEmailSection prefs={prefs} mutate={mutatePrefs} setError={setError} toast={toast} />

          {/* ── Test push ────────────────────────────────────────────────── */}
          <TestPushSection setError={setError} toast={toast} />

          {/* ── History ──────────────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
              Recent notifications
              {history && history.length > 0 && (
                <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--preview-text-3)" }}>
                  last {history.length}
                </span>
              )}
            </h2>
            {history === null ? (
              <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>Loading…</p>
            ) : history.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center"
                style={{ borderColor: "var(--preview-border)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>
                  Nothing here yet
                </p>
                <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
                  As alerts fire, they&apos;ll appear here so you can confirm cadence + verify the right things triggered.
                </p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border"
                style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
                {history.map((h, i) => (
                  <HistoryRow key={h.id} item={h} showTopBorder={i > 0} streamById={streamById} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

// ── No-streams empty state ──────────────────────────────────────────────────

function NoStreamsBlock({ hasStreams }: { hasStreams: boolean }) {
  return (
    <section className="mb-8">
      <div className="rounded-xl border border-dashed p-6 text-center"
        style={{ borderColor: "var(--preview-border)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>
          {hasStreams ? "No active vestings to alert on" : "No vesting streams indexed yet"}
        </p>
        <p className="text-xs mb-3" style={{ color: "var(--preview-text-3)" }}>
          {hasStreams
            ? "All your tracked vestings are fully vested — there's nothing left to count down to. Add a wallet with active positions to set up alerts."
            : "Alert controls appear here once your tracked wallets have vesting positions. Add a wallet from the Dashboard or scan one with the Wallet Scanner."}
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/dashboard"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
            Open Dashboard →
          </Link>
          <Link href="/dashboard/discover"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}>
            Wallet Scanner
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Token selector ──────────────────────────────────────────────────────────
// ≤4 active streams → inline pill row. >4 → a dropdown, so a long list stays
// compact (mirrors the mobile PILL_TO_DROPDOWN_THRESHOLD = 4).

const PILL_TO_DROPDOWN_THRESHOLD = 4;

function TokenSelector({
  streams, selectedId, streamPrefs, labelFor, onSelect,
}: {
  streams:     Stream[];
  selectedId:  string | null;
  streamPrefs: Record<string, RawStreamPref>;
  labelFor:    (s: Stream) => string;
  onSelect:    (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (streams.length <= PILL_TO_DROPDOWN_THRESHOLD) {
    return (
      <div className="flex flex-wrap gap-2">
        {streams.map((s) => {
          const armed = activeSlotCount(streamPrefs[s.id]);
          const active = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: active ? "rgba(28,184,184,0.14)" : "var(--preview-card)",
                color:      active ? "#0F8A8A" : "var(--preview-text-2)",
                border:     `1px solid ${active ? "rgba(28,184,184,0.35)" : "var(--preview-border)"}`,
              }}
            >
              {labelFor(s)}
              {armed > 0 && <ArmedBadge n={armed} active={active} />}
            </button>
          );
        })}
      </div>
    );
  }

  const selected = streams.find((s) => s.id === selectedId);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-sm font-semibold px-3 py-2.5 rounded-lg"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
      >
        <span className="flex items-center gap-2">
          {selected ? labelFor(selected) : "Select a token"}
          {selected && activeSlotCount(streamPrefs[selected.id]) > 0 && (
            <ArmedBadge n={activeSlotCount(streamPrefs[selected.id])} active />
          )}
        </span>
        <span className="text-xs" style={{ color: "var(--preview-text-3)" }}>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg shadow-lg"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            {streams.map((s, i) => {
              const armed = activeSlotCount(streamPrefs[s.id]);
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onSelect(s.id); setOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--preview-muted)]"
                  style={{
                    borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined,
                    color: active ? "#0F8A8A" : "var(--preview-text)",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span>{labelFor(s)}</span>
                  <span className="flex items-center gap-2">
                    {armed > 0 && <ArmedBadge n={armed} active={active} />}
                    {active && <span className="text-xs">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ArmedBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span className="inline-flex items-center justify-center text-[9px] font-bold rounded-full"
      style={{
        minWidth: 15, height: 15, padding: "0 4px",
        background: active ? "rgba(15,138,138,0.18)" : "rgba(28,184,184,0.12)",
        color: "#0F8A8A",
      }}
      title={`${n} alert${n === 1 ? "" : "s"} armed`}
    >
      {n}
    </span>
  );
}

// ── Per-token alert config ──────────────────────────────────────────────────

const DEFAULT_TIMINGS: Record<1 | 2 | 3, number> = { 1: 24, 2: 1, 3: 0 };

function StreamAlertConfig({
  stream, raw, globalHours, saving, onSave,
}: {
  stream:      Stream;
  raw:         RawStreamPref | undefined;
  globalHours: number;
  saving:      boolean;
  onSave:      (next: StreamPref) => void;
}) {
  const decoded = useMemo(() => decodeStreamPref(raw), [raw]);
  const [draft, setDraft] = useState<StreamPref>(decoded);
  useEffect(() => { setDraft(decodeStreamPref(raw)); }, [raw]);

  const isContinuous = CONTINUOUS_PROTOCOLS.has(stream.protocol);
  const chainName = CHAIN_NAMES[stream.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${stream.chainId}`;

  // Which event triggers this stream's lifecycle actually supports.
  const eventAvailable = useMemo<Record<string, boolean>>(() => ({
    "vesting-start": !!stream.startTime,
    "cliff":         !!stream.cliffTime,
    "stream-end":    !!stream.endTime,
  }), [stream]);

  function commit(next: StreamPref) {
    setDraft(next);
    onSave(next);
  }

  function setSlot(slot: 1 | 2 | 3, patch: StreamSlotPref) {
    commit({ ...draft, slots: { ...draft.slots, [slot]: { ...draft.slots[slot], ...patch } } });
  }

  function toggleSlot(slot: 1 | 2 | 3, on: boolean) {
    if (!on) { setSlot(slot, { enabled: false }); return; }
    // Sensible default when turning a slot on (mirrors the mobile app):
    // continuous streams default to a $1,000 value trigger; everything else
    // to a before-unlock timing (24h / 1h / Live for slots 1/2/3).
    if (isContinuous) {
      setSlot(slot, { enabled: true, triggerType: "threshold", thresholdUsd: 1000, hoursBeforeUnlock: null });
    } else {
      setSlot(slot, { enabled: true, triggerType: "before-unlock", hoursBeforeUnlock: DEFAULT_TIMINGS[slot], thresholdUsd: null });
    }
  }

  return (
    <div className="rounded-xl border p-4"
      style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
      {/* Token heading + mute */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: "var(--preview-text)" }}>
            {stream.tokenSymbol}
            <span className="font-normal ml-1" style={{ color: "var(--preview-text-3)" }}>
              · {stream.protocol} · {chainName}
            </span>
          </p>
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
            {isContinuous
              ? "Streams continuously — alert by claimable value."
              : "Choose up to three independent alerts for this token."}
          </p>
        </div>
        {saving && (
          <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-3)" }}>Saving…</span>
        )}
      </div>

      <div className="mt-2 divide-y" style={{ borderColor: "var(--preview-border-2)" }}>
        {([1, 2, 3] as const).map((slot) => (
          <AlertSlotRow
            key={slot}
            index={slot}
            slot={draft.slots[slot]}
            globalHours={globalHours}
            isContinuous={isContinuous}
            eventAvailable={eventAvailable}
            onToggle={(on) => toggleSlot(slot, on)}
            onChange={(patch) => setSlot(slot, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function AlertSlotRow({
  index, slot, globalHours, isContinuous, eventAvailable, onToggle, onChange,
}: {
  index:          1 | 2 | 3;
  slot:           StreamSlotPref;
  globalHours:    number;
  isContinuous:   boolean;
  eventAvailable: Record<string, boolean>;
  onToggle:       (on: boolean) => void;
  onChange:       (patch: StreamSlotPref) => void;
}) {
  const on = slot.enabled === true;
  return (
    <div className="py-3" style={{ borderTopColor: "var(--preview-border-2)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>
            Alert {index}
          </p>
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
            {on ? `Notify ${slotSummary(slot, globalHours)}` : "Off"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!on)}
          className="text-[10px] font-bold px-2 py-1 rounded flex-shrink-0"
          style={{
            background: on ? "rgba(28,184,184,0.12)" : "rgba(0,0,0,0.04)",
            color:      on ? "#0F8A8A" : "var(--preview-text-3)",
            border:     `1px solid ${on ? "rgba(28,184,184,0.25)" : "var(--preview-border)"}`,
          }}
        >
          {on ? "ON" : "OFF"}
        </button>
      </div>

      {on && (
        <div className="mt-3">
          <TriggerPicker
            slot={slot}
            isContinuous={isContinuous}
            eventAvailable={eventAvailable}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

// ── Trigger picker (timing / event / value chips) ───────────────────────────

function TriggerPicker({
  slot, isContinuous, eventAvailable, onChange,
}: {
  slot:           StreamSlotPref;
  isContinuous:   boolean;
  eventAvailable: Record<string, boolean>;
  onChange:       (patch: StreamSlotPref) => void;
}) {
  const trig = slot.triggerType ?? "before-unlock";
  const activeHours = trig === "before-unlock" ? (slot.hoursBeforeUnlock ?? null) : null;
  const activeValue = trig === "threshold"     ? (slot.thresholdUsd ?? null)      : null;

  return (
    <div className="space-y-3">
      {!isContinuous && (
        <>
          {/* Timing */}
          <ChipGroup label="Timing">
            {TIMING_OPTIONS.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                active={activeHours != null && Math.abs(activeHours - o.hours) < 1e-6}
                onClick={() => onChange({ triggerType: "before-unlock", hoursBeforeUnlock: o.hours, thresholdUsd: null })}
              />
            ))}
          </ChipGroup>

          {/* Events */}
          <ChipGroup label="Event">
            {EVENT_TRIGGERS.map((ev) => {
              const available = eventAvailable[ev];
              return (
                <Chip
                  key={ev}
                  label={EVENT_LABELS[ev]}
                  active={trig === ev}
                  disabled={!available}
                  title={available ? undefined : `No ${EVENT_LABELS[ev].toLowerCase()} in this schedule`}
                  onClick={() => onChange({ triggerType: ev, hoursBeforeUnlock: null, thresholdUsd: null })}
                />
              );
            })}
          </ChipGroup>
        </>
      )}

      {/* Value crosses */}
      <ChipGroup label="Value crosses">
        {VALUE_OPTIONS.map((v) => (
          <Chip
            key={v}
            label={`$${v.toLocaleString()}`}
            active={activeValue === v}
            onClick={() => onChange({ triggerType: "threshold", thresholdUsd: v, hoursBeforeUnlock: null })}
          />
        ))}
      </ChipGroup>
      <p className="text-[10.5px]" style={{ color: "var(--preview-text-3)" }}>
        {isContinuous
          ? "This token streams continuously, so there's no unlock to count down to — get alerted when its claimable value passes an amount instead."
          : "“Value crosses” fires once when this token's claimable value passes the amount."}
      </p>
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--preview-text-3)" }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label, active, disabled, title, onClick,
}: {
  label:    string;
  active:   boolean;
  disabled?: boolean;
  title?:   string;
  onClick:  () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors"
      style={{
        background: active ? "rgba(28,184,184,0.14)" : "var(--preview-muted)",
        color:      disabled ? "var(--preview-text-3)" : active ? "#0F8A8A" : "var(--preview-text-2)",
        border:     `1px solid ${active ? "rgba(28,184,184,0.30)" : "var(--preview-border)"}`,
        opacity:    disabled ? 0.4 : 1,
        cursor:     disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ── History row ─────────────────────────────────────────────────────────────

function HistoryRow({
  item, showTopBorder, streamById,
}: {
  item:          HistoryItem;
  showTopBorder: boolean;
  streamById:    Map<string, Stream>;
}) {
  const stream = streamById.get(item.streamId);
  const chainName = item.chainId != null
    ? (CHAIN_NAMES[item.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${item.chainId}`)
    : null;
  const protocol = item.protocol ?? stream?.protocol ?? null;
  const eventRel = formatRelative(item.eventTime);
  const sentRel  = formatRelative(item.sentAt);

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3"
      style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>
          {item.tokenSymbol}
          {item.isTest && (
            <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}>
              Test
            </span>
          )}
          <span className="font-normal ml-1" style={{ color: "var(--preview-text-3)" }}>
            {protocol ? `· ${protocol}` : ""}{chainName ? ` · ${chainName}` : ""}
          </span>
        </p>
        <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>
          Unlock event: {eventRel}
          {item.tokenAddress && (
            <>
              {" · "}
              <CopyButton value={item.tokenAddress} display={shortAddr(item.tokenAddress)} style={{ color: "var(--preview-text-3)" }} />
            </>
          )}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          Sent
        </p>
        <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--preview-text-2)" }}>
          {sentRel}
        </p>
      </div>
    </div>
  );
}

// ── Global email prefs ──────────────────────────────────────────────────────
// Writes to /api/notifications/preferences (PUT) — the SAME row the mobile app
// writes via /api/mobile/notifications. Toggle on either surface, see on both.

type MutatePrefsFn = (
  updater: (cur: { preferences: Partial<Prefs> | null } | undefined) =>
    { preferences: Partial<Prefs> | null } | undefined,
  opts?: { revalidate?: boolean },
) => void;

async function putGlobalPref(patch: Partial<Prefs>): Promise<void> {
  const res = await fetch("/api/notifications/preferences", {
    method:  "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(patch),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error((errJson as { error?: string }).error ?? "Failed to save");
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GlobalEmailSection({
  prefs, mutate, setError, toast,
}: {
  prefs:    Prefs;
  mutate:   MutatePrefsFn;
  setError: (s: string | null) => void;
  toast:    ReturnType<typeof useToast>;
}) {
  const [emailDraft, setEmailDraft] = useState<string>(prefs.email ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setEmailDraft(prefs.email ?? "");
  }, [prefs.email, editing]);

  const emailValid = emailDraft.trim().length === 0 || EMAIL_RE.test(emailDraft.trim());

  async function setEnabled(v: boolean) {
    setSaving("emailEnabled");
    setError(null);
    mutate((cur) => cur ? { preferences: { ...(cur.preferences ?? {}), emailEnabled: v } } : cur, { revalidate: false });
    try {
      await putGlobalPref({ emailEnabled: v });
      mutate((cur) => cur, { revalidate: true });
      toast.success(v ? "Email alerts on" : "Email alerts off");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      setError(msg);
      toast.error(msg);
      mutate((cur) => cur, { revalidate: true });
    } finally {
      setSaving(null);
    }
  }

  async function saveEmail() {
    if (!emailValid) return;
    setSaving("email");
    setError(null);
    const next = emailDraft.trim().length === 0 ? null : emailDraft.trim();
    try {
      await putGlobalPref({ email: next });
      mutate((cur) => cur ? { preferences: { ...(cur.preferences ?? {}), email: next } } : cur, { revalidate: true });
      setEditing(false);
      toast.success("Email address saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
        Email alerts
        <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--preview-text-3)" }}>
          also delivered for every armed alert above
        </span>
      </h2>
      <div className="rounded-xl border p-4"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>Email me about unlocks</p>
            <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
              {prefs.email ? `Sent to ${prefs.email}` : "Set an email address below first."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!prefs.emailEnabled)}
            disabled={saving === "emailEnabled"}
            className="text-[10px] font-bold px-2 py-1 rounded flex-shrink-0"
            style={{
              background: prefs.emailEnabled ? "rgba(28,184,184,0.12)" : "rgba(0,0,0,0.04)",
              color:      prefs.emailEnabled ? "#0F8A8A" : "var(--preview-text-3)",
              border:     `1px solid ${prefs.emailEnabled ? "rgba(28,184,184,0.25)" : "var(--preview-border)"}`,
              opacity:    saving === "emailEnabled" ? 0.6 : 1,
            }}
          >
            {prefs.emailEnabled ? "ON" : "OFF"}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3"
          style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          <input
            type="email"
            value={emailDraft}
            onFocus={() => setEditing(true)}
            onChange={(e) => { setEmailDraft(e.target.value); setEditing(true); }}
            placeholder="you@example.com"
            className="flex-1 text-xs px-2 py-1.5 rounded"
            style={{
              background: "var(--preview-muted)",
              border:     `1px solid ${emailValid ? "var(--preview-border)" : "rgba(220,38,38,0.45)"}`,
              color:      "var(--preview-text)",
            }}
          />
          <button
            type="button"
            onClick={saveEmail}
            disabled={!emailValid || saving === "email" || !editing}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-md"
            style={{
              background: "#1CB8B8",
              color:      "white",
              border:     "1px solid #1CB8B8",
              opacity:    (!emailValid || saving === "email" || !editing) ? 0.5 : 1,
            }}
          >
            {saving === "email" ? "Saving…" : "Save"}
          </button>
        </div>
        {!emailValid && (
          <p className="text-[11px] mt-2" style={{ color: "#dc2626" }}>
            That doesn&apos;t look like a valid email address.
          </p>
        )}
      </div>
    </section>
  );
}

// ── Test push ───────────────────────────────────────────────────────────────

function TestPushSection({
  setError, toast,
}: {
  setError: (s: string | null) => void;
  toast:    ReturnType<typeof useToast>;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [hint, setHint] = useState<string | null>(null);

  async function send() {
    setStatus("sending");
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = (errJson as { error?: string }).error ?? "Failed to send";
        setStatus("error");
        setHint(msg);
        toast.error(msg);
        return;
      }
      setStatus("sent");
      setHint("Test push sent. Check your mobile device — it should arrive within a few seconds.");
      toast.success("Test push sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send";
      setStatus("error");
      setHint(msg);
      toast.error(msg);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
        Test
      </h2>
      <div className="rounded-xl border p-4"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>
              Send a test push to your phone
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
              Confirms permissions, your push token, and the relay are wired up — without waiting for a real unlock. Requires the mobile app installed and signed in to this account.
            </p>
          </div>
          <button
            type="button"
            onClick={send}
            disabled={status === "sending"}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-md flex-shrink-0"
            style={{
              background: status === "sent" ? "rgba(28,184,184,0.10)" : "#1CB8B8",
              color:      status === "sent" ? "#0F8A8A" : "white",
              border:     "1px solid #1CB8B8",
              opacity:    status === "sending" ? 0.6 : 1,
            }}
          >
            {status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : "Send test"}
          </button>
        </div>
        {hint && (
          <p className="text-[11px] mt-3"
            style={{ color: status === "error" ? "#dc2626" : "var(--preview-text-3)" }}>
            {hint}
          </p>
        )}
      </div>
    </section>
  );
}
