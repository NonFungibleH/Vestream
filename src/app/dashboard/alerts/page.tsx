"use client";

// /dashboard/alerts
// ─────────────────────────────────────────────────────────────────────────────
// Web alerts management — the Pro-tier credibility gap fix. Until 2026-06-12
// a user paying $9.99/mo could only manage alerts from the mobile app; the
// web /settings page only carried email/push global toggles. This page brings
// per-stream alert config (the same shape the mobile app already uses via
// `streamPrefs` JSONB) onto the desktop, plus a notification history feed so
// alerts feel real instead of invisible.
//
// Layout (top → bottom):
//   1. Header + sub-nav into the page sections.
//   2. ACTIVE ALERTS — every stream with non-default streamPrefs (any of
//      alert{1,2,3}Enabled true, or thresholdUsd{1,2,3} set). Click a row
//      to expand into an editor panel (no modal — inline expand is cheaper
//      and keeps deep links working).
//   3. ALL STREAMS — every other stream the user has, with a "+ Add alert"
//      affordance so they can configure one for streams that don't yet have
//      custom prefs (the global defaults apply otherwise).
//   4. HISTORY — last 50 notifications from notifications_sent.
//
// Data sources:
//   - GET /api/notifications/preferences  (existing, returns streamPrefs)
//   - PUT /api/notifications/preferences  (extended 2026-06-12 to write streamPrefs)
//   - GET /api/notifications/history      (new, this batch)
//   - GET /api/vesting                    (existing — for the stream list)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { useDarkMode } from "@/lib/use-dark-mode";

type TriggerType = "before-unlock" | "cliff" | "stream-end" | "threshold";

interface StreamSlotPref {
  enabled?:         boolean;
  triggerType?:     TriggerType;
  hoursBeforeUnlock?: number | null;
  thresholdUsd?:    number | null;
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
  notifyCliff:       boolean;
  notifyStreamEnd:   boolean;
  notifyMonthly:     boolean;
  notifyNextClaim:   boolean;
  streamPrefs:       Record<string, RawStreamPref>;
}

interface Stream {
  id:           string;
  protocol:     string;
  chainId:      number;
  tokenSymbol:  string;
  tokenAddress: string;
  isFullyVested: boolean;
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

const HOUR_OPTIONS = [1, 6, 12, 24, 48, 72] as const;
const TRIGGER_LABELS: Record<TriggerType, string> = {
  "before-unlock": "Before unlock",
  "cliff":         "Cliff hits",
  "stream-end":    "Stream ends",
  "threshold":     "Threshold $",
};

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

/** A stream is "managed" (shows up under Active alerts) when its prefs
 *  diverge from defaults — either muted or any slot configured. */
function isManaged(raw: RawStreamPref | undefined): boolean {
  if (!raw) return false;
  if (raw.enabled === false) return true; // explicitly muted
  if (raw.alert1Enabled || raw.alert2Enabled || raw.alert3Enabled) return true;
  if (raw.thresholdUsd1 != null || raw.thresholdUsd2 != null || raw.thresholdUsd3 != null) return true;
  if (raw.pushTiming2 != null) return true; // legacy implicit Alert 2 enable
  return false;
}

function activeSlotCount(raw: RawStreamPref): number {
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
  const { dark: _dark } = useDarkMode();
  // `dark` is unused inside the markup (CSS vars own all theming via the
  // provider's wrapper) but we keep the hook call so the provider's
  // reactive subscription stays mounted — drops the lint warning without
  // changing behaviour.
  void _dark;

  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  // Three independent SWR caches — each survives navigation away/back
  // (60s dedupe via the dashboard's SWRConfig provider), so revisiting
  // /dashboard/alerts after a 5-second detour is instant instead of
  // showing the "Loading alerts…" skeleton three times. The fetcher
  // pushes 401s through the same /login bounce the old useEffect did.
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
  const { data: streamsRaw } = useSWR<{ streams: Stream[] }>(
    "/api/vesting",
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
      notifyCliff:       p.notifyCliff       ?? true,
      notifyStreamEnd:   p.notifyStreamEnd   ?? true,
      notifyMonthly:     p.notifyMonthly     ?? false,
      notifyNextClaim:   p.notifyNextClaim   ?? true,
      streamPrefs:       p.streamPrefs       ?? {},
    };
  }, [prefsRaw]);
  const streams: Stream[] | null = useMemo(() => {
    if (streamsRaw === undefined) return null;
    return (streamsRaw.streams ?? []).map((s) => ({
      id: s.id, protocol: s.protocol, chainId: s.chainId,
      tokenSymbol: s.tokenSymbol, tokenAddress: s.tokenAddress,
      isFullyVested: s.isFullyVested,
    }));
  }, [streamsRaw]);
  const history: HistoryItem[] | null = useMemo(
    () => historyRaw === undefined ? null : (historyRaw.items ?? []),
    [historyRaw],
  );

  // ── Persist a single stream's prefs ─────────────────────────────────────
  // Mutations write through SWR's cache via mutate() so the local state
  // and the cache stay in sync — the next page nav that revisits this
  // route reads the freshly mutated cache, not a stale snapshot.
  const saveStreamPref = useCallback(async (streamId: string, next: StreamPref) => {
    if (!prefs) return;
    setSavingId(streamId);
    setError(null);
    const encoded = encodeStreamPref(next);
    const merged: Record<string, RawStreamPref> = { ...prefs.streamPrefs, [streamId]: encoded };
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamPrefs: merged }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error ?? "Failed to save");
      }
      // Optimistic SWR cache update — passes the merged shape back into
      // the cache so the row reflects the new state without a fetch
      // round-trip. `revalidate: true` kicks off a quiet background fetch
      // to confirm with the server.
      mutatePrefs(
        (cur) => cur ? { preferences: { ...(cur.preferences ?? {}), streamPrefs: merged } } : cur,
        { revalidate: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }, [prefs, mutatePrefs]);

  const clearStreamPref = useCallback(async (streamId: string) => {
    if (!prefs) return;
    setSavingId(streamId);
    setError(null);
    const merged: Record<string, RawStreamPref> = { ...prefs.streamPrefs };
    delete merged[streamId];
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamPrefs: merged }),
      });
      if (!res.ok) throw new Error("Failed to clear");
      mutatePrefs(
        (cur) => cur ? { preferences: { ...(cur.preferences ?? {}), streamPrefs: merged } } : cur,
        { revalidate: true },
      );
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
    } finally {
      setSavingId(null);
    }
  }, [prefs]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const streamById = useMemo(() => {
    const m = new Map<string, Stream>();
    for (const s of streams ?? []) m.set(s.id, s);
    return m;
  }, [streams]);

  const activeAlerts = useMemo(() => {
    if (!prefs || !streams) return [];
    return streams.filter((s) => isManaged(prefs.streamPrefs[s.id]));
  }, [prefs, streams]);

  const otherStreams = useMemo(() => {
    if (!prefs || !streams) return [];
    return streams.filter((s) => !isManaged(prefs.streamPrefs[s.id]) && !s.isFullyVested);
  }, [prefs, streams]);

  const activeSlotTotal = useMemo(() => {
    if (!prefs) return 0;
    return Object.values(prefs.streamPrefs).reduce((n, r) => n + activeSlotCount(r), 0);
  }, [prefs]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 max-w-5xl w-full">
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
        Configure email, push, and per-stream alerts. Everything on this page is shared with the mobile app — toggle on either, see it on both.
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
          {/* ── Push alerts (globals) ─────────────────────────────────────
              These match the mobile app's "Push alerts" section. They
              apply to every tracked stream unless overridden in Active
              alerts below. */}
          <GlobalPushSection prefs={prefs} mutate={mutatePrefs} setError={setError} />

          {/* ── Email alerts (globals) ───────────────────────────────────
              Same shape as the mobile "Email alerts" section. */}
          <GlobalEmailSection prefs={prefs} mutate={mutatePrefs} setError={setError} />

          {/* ── Test push ─────────────────────────────────────────────── */}
          <TestPushSection setError={setError} />

          {/* ── Active alerts (per-stream overrides) ──────────────────── */}
          <section className="mb-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
                Per-stream alerts
                {activeAlerts.length > 0 && (
                  <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--preview-text-3)" }}>
                    {activeSlotTotal} slot{activeSlotTotal === 1 ? "" : "s"} across {activeAlerts.length} stream{activeAlerts.length === 1 ? "" : "s"}
                  </span>
                )}
              </h2>
            </div>
            {activeAlerts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center"
                style={{ borderColor: "var(--preview-border)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>
                  No per-stream overrides yet
                </p>
                <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
                  Your global push + email settings above apply to every stream by default. Use the list below to set up a custom alert (different timing, threshold-USD trigger) for a specific token.
                </p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border"
                style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
                {activeAlerts.map((s, i) => (
                  <StreamAlertRow
                    key={s.id}
                    stream={s}
                    raw={prefs.streamPrefs[s.id]}
                    globalHours={prefs.hoursBeforeUnlock}
                    expanded={expandedId === s.id}
                    saving={savingId === s.id}
                    showTopBorder={i > 0}
                    onToggleExpand={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onSave={(next) => saveStreamPref(s.id, next)}
                    onClear={() => clearStreamPref(s.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Streams without custom alerts ─────────────────────────── */}
          {otherStreams.length > 0 ? (
            <section className="mb-8">
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
                Your other streams
                <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--preview-text-3)" }}>
                  using global defaults
                </span>
              </h2>
              <div className="rounded-xl overflow-hidden border"
                style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
                {otherStreams.map((s, i) => (
                  <StreamAlertRow
                    key={s.id}
                    stream={s}
                    raw={undefined}
                    globalHours={prefs.hoursBeforeUnlock}
                    expanded={expandedId === s.id}
                    saving={savingId === s.id}
                    showTopBorder={i > 0}
                    onToggleExpand={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    onSave={(next) => saveStreamPref(s.id, next)}
                    onClear={() => clearStreamPref(s.id)}
                  />
                ))}
              </div>
            </section>
          ) : streams.length === 0 && (
            // streams.length === 0 → no tracked wallets / no vestings indexed
            // yet. Surface a clear next-step instead of letting the page look
            // empty (users would assume alerts are broken otherwise).
            <section className="mb-8">
              <div className="rounded-xl border border-dashed p-6 text-center"
                style={{ borderColor: "var(--preview-border)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>
                  No vesting streams indexed yet
                </p>
                <p className="text-xs mb-3" style={{ color: "var(--preview-text-3)" }}>
                  Per-stream alert controls appear here once your tracked wallets have vesting positions. Add a wallet from the Dashboard or scan one with the Wallet Scanner.
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
          )}

          {/* ── History ───────────────────────────────────────────────── */}
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

// ── Per-stream row with inline editor ───────────────────────────────────────

function StreamAlertRow({
  stream, raw, globalHours, expanded, saving, showTopBorder,
  onToggleExpand, onSave, onClear,
}: {
  stream:          Stream;
  raw:             RawStreamPref | undefined;
  globalHours:     number;
  expanded:        boolean;
  saving:          boolean;
  showTopBorder:   boolean;
  onToggleExpand:  () => void;
  onSave:          (next: StreamPref) => void;
  onClear:         () => void;
}) {
  const decoded = useMemo(() => decodeStreamPref(raw), [raw]);
  const [draft, setDraft] = useState<StreamPref>(decoded);

  // Re-sync the draft when the underlying raw prefs change (e.g. after a save).
  useEffect(() => { setDraft(decodeStreamPref(raw)); }, [raw]);

  const chainName = CHAIN_NAMES[stream.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${stream.chainId}`;

  // Summary chips for the collapsed row.
  const summary: string[] = [];
  for (const slot of [1, 2, 3] as const) {
    const s = decoded.slots[slot];
    if (!s.enabled) continue;
    const trig = s.triggerType ?? "before-unlock";
    if (trig === "before-unlock") {
      const hours = s.hoursBeforeUnlock ?? globalHours;
      summary.push(`${hours}h before unlock`);
    } else if (trig === "threshold") {
      summary.push(s.thresholdUsd != null ? `$${s.thresholdUsd.toLocaleString()} threshold` : "threshold");
    } else {
      summary.push(TRIGGER_LABELS[trig]);
    }
  }
  if (!decoded.enabled) summary.unshift("Muted");

  return (
    <div style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--preview-muted)] transition-colors"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>
            {stream.tokenSymbol}{" "}
            <span className="font-normal" style={{ color: "var(--preview-text-3)" }}>
              · {stream.protocol} · {chainName}
            </span>
          </p>
          {summary.length > 0 ? (
            <p className="text-xs truncate mt-0.5" style={{ color: "var(--preview-text-2)" }}>
              {summary.join("  ·  ")}
            </p>
          ) : (
            <p className="text-xs truncate mt-0.5" style={{ color: "var(--preview-text-3)" }}>
              Using global default ({globalHours}h before unlock)
            </p>
          )}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "#0F8A8A" }}>
          {expanded ? "Close" : (raw ? "Edit" : "Set up")}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1">
          <div className="rounded-lg p-3"
            style={{ background: "rgba(28,184,184,0.04)", border: "1px solid rgba(28,184,184,0.15)" }}>
            {/* Master enable / mute toggle */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>
                {draft.enabled ? "Alerts on for this stream" : "Muted — no alerts will fire"}
              </span>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                style={{
                  background: draft.enabled ? "rgba(28,184,184,0.10)" : "rgba(0,0,0,0.04)",
                  color:      draft.enabled ? "#0F8A8A" : "var(--preview-text-2)",
                  border:     `1px solid ${draft.enabled ? "rgba(28,184,184,0.25)" : "var(--preview-border)"}`,
                }}
              >
                {draft.enabled ? "Mute" : "Unmute"}
              </button>
            </div>

            {/* Three slots */}
            <div className="space-y-3">
              {([1, 2, 3] as const).map((slot) => (
                <SlotEditor
                  key={slot}
                  slotNumber={slot}
                  pref={draft.slots[slot]}
                  globalHours={globalHours}
                  onChange={(nextSlot) => setDraft({
                    ...draft,
                    slots: { ...draft.slots, [slot]: nextSlot },
                  })}
                />
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-3">
              {raw && (
                <button
                  type="button"
                  onClick={onClear}
                  disabled={saving}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{
                    background: "transparent",
                    color: "var(--preview-text-3)",
                    border: "1px solid var(--preview-border)",
                  }}
                >
                  Reset to defaults
                </button>
              )}
              <button
                type="button"
                onClick={() => onSave(draft)}
                disabled={saving}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{
                  background: "#1CB8B8",
                  color:      "white",
                  border:     "1px solid #1CB8B8",
                  opacity:    saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save alert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotEditor({
  slotNumber, pref, globalHours, onChange,
}: {
  slotNumber:  1 | 2 | 3;
  pref:        StreamSlotPref;
  globalHours: number;
  onChange:    (next: StreamSlotPref) => void;
}) {
  const enabled = pref.enabled ?? false;
  const trigger = pref.triggerType ?? "before-unlock";
  const hours = pref.hoursBeforeUnlock ?? globalHours;
  const threshold = pref.thresholdUsd ?? "";

  return (
    <div className="rounded-md p-2.5"
      style={{
        background: enabled ? "var(--preview-card)" : "transparent",
        border:     `1px solid ${enabled ? "var(--preview-border)" : "transparent"}`,
        opacity:    enabled ? 1 : 0.7,
      }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--preview-text-3)" }}>
          Alert slot {slotNumber}
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...pref, enabled: !enabled })}
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{
            background: enabled ? "rgba(28,184,184,0.12)" : "rgba(0,0,0,0.04)",
            color:      enabled ? "#0F8A8A" : "var(--preview-text-3)",
          }}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      {enabled && (
        <div className="space-y-2">
          {/* Trigger type pills */}
          <div className="flex flex-wrap gap-1">
            {(["before-unlock", "cliff", "stream-end", "threshold"] as TriggerType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...pref, triggerType: t })}
                className="text-[10px] font-semibold px-2 py-1 rounded"
                style={{
                  background: trigger === t ? "rgba(28,184,184,0.14)" : "var(--preview-muted)",
                  color:      trigger === t ? "#0F8A8A" : "var(--preview-text-2)",
                  border:     `1px solid ${trigger === t ? "rgba(28,184,184,0.30)" : "var(--preview-border)"}`,
                }}
              >
                {TRIGGER_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Conditional secondary control depending on trigger */}
          {trigger === "before-unlock" && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] font-semibold mr-1" style={{ color: "var(--preview-text-3)" }}>
                Hours:
              </span>
              {HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onChange({ ...pref, hoursBeforeUnlock: h })}
                  className="text-[10px] font-semibold px-2 py-1 rounded"
                  style={{
                    background: hours === h ? "rgba(28,184,184,0.14)" : "var(--preview-muted)",
                    color:      hours === h ? "#0F8A8A" : "var(--preview-text-2)",
                    border:     `1px solid ${hours === h ? "rgba(28,184,184,0.30)" : "var(--preview-border)"}`,
                  }}
                >
                  {h}h
                </button>
              ))}
            </div>
          )}
          {trigger === "threshold" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-3)" }}>
                Fire when claimable USD passes:
              </span>
              <span className="text-xs" style={{ color: "var(--preview-text-2)" }}>$</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1_000_000}
                value={threshold}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({ ...pref, thresholdUsd: Number.isFinite(n) && n > 0 ? Math.floor(n) : null });
                }}
                placeholder="1000"
                className="text-xs px-2 py-1 rounded w-24"
                style={{
                  background: "var(--preview-card)",
                  border:     "1px solid var(--preview-border)",
                  color:      "var(--preview-text)",
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
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
              <span className="font-mono">{shortAddr(item.tokenAddress)}</span>
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

// ── Global push prefs ───────────────────────────────────────────────────────
// Mirrors the mobile app's "Push alerts" section. Each toggle / hour pill
// writes through to /api/notifications/preferences (PUT), which is the SAME
// row that the mobile app's /api/mobile/notifications writes to — toggle
// on either surface, see it on both.

const VALID_HOURS = [1, 6, 12, 24, 48, 72] as const;

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

function GlobalPushSection({
  prefs, mutate, setError,
}: {
  prefs:    Prefs;
  mutate:   MutatePrefsFn;
  setError: (s: string | null) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  async function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setSaving(key as string);
    setError(null);
    // Optimistic SWR update so the toggle feels instant; on error we
    // revert by re-reading from the server.
    mutate(
      (cur) => cur ? { preferences: { ...(cur.preferences ?? {}), [key]: value } } : cur,
      { revalidate: false },
    );
    try {
      await putGlobalPref({ [key]: value } as Partial<Prefs>);
      mutate((cur) => cur, { revalidate: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      mutate((cur) => cur, { revalidate: true });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
        Push alerts
        <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--preview-text-3)" }}>
          apply to every tracked stream
        </span>
      </h2>
      <div className="rounded-xl border p-4"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        {/* Lead-time pills */}
        <div className="mb-4">
          <p className="text-[11px] font-semibold mb-2" style={{ color: "var(--preview-text-2)" }}>
            Notify me before an unlock
            <span className="ml-2 text-[10px] font-normal" style={{ color: "var(--preview-text-3)" }}>
              applied unless a per-stream override is set
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {VALID_HOURS.map((h) => (
              <button
                key={h}
                type="button"
                disabled={saving !== null}
                onClick={() => set("hoursBeforeUnlock", h)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
                style={{
                  background: prefs.hoursBeforeUnlock === h ? "rgba(28,184,184,0.14)" : "var(--preview-muted)",
                  color:      prefs.hoursBeforeUnlock === h ? "#0F8A8A" : "var(--preview-text-2)",
                  border:     `1px solid ${prefs.hoursBeforeUnlock === h ? "rgba(28,184,184,0.30)" : "var(--preview-border)"}`,
                  opacity:    saving === "hoursBeforeUnlock" ? 0.6 : 1,
                }}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Event toggles */}
        <div className="space-y-2 pt-3"
          style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          <PrefToggle label="Cliff hits"             desc="Fires when a vesting cliff triggers." value={prefs.notifyCliff}     saving={saving === "notifyCliff"}     onChange={(v) => set("notifyCliff", v)} />
          <PrefToggle label="Stream ends"            desc="Fires when a vest is fully claimable." value={prefs.notifyStreamEnd} saving={saving === "notifyStreamEnd"} onChange={(v) => set("notifyStreamEnd", v)} />
          <PrefToggle label="Monthly summary"        desc="Recap of upcoming unlocks once a month." value={prefs.notifyMonthly}  saving={saving === "notifyMonthly"}   onChange={(v) => set("notifyMonthly", v)} />
          <PrefToggle label="Next available claim"   desc="Heads-up the moment tokens become claimable." value={prefs.notifyNextClaim} saving={saving === "notifyNextClaim"} onChange={(v) => set("notifyNextClaim", v)} />
        </div>
      </div>
    </section>
  );
}

function PrefToggle({
  label, desc, value, saving, onChange,
}: {
  label:    string;
  desc:     string;
  value:    boolean;
  saving:   boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>{label}</p>
        <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        disabled={saving}
        className="text-[10px] font-bold px-2 py-1 rounded flex-shrink-0"
        style={{
          background: value ? "rgba(28,184,184,0.12)" : "rgba(0,0,0,0.04)",
          color:      value ? "#0F8A8A" : "var(--preview-text-3)",
          border:     `1px solid ${value ? "rgba(28,184,184,0.25)" : "var(--preview-border)"}`,
          opacity:    saving ? 0.6 : 1,
        }}
      >
        {value ? "ON" : "OFF"}
      </button>
    </div>
  );
}

// ── Global email prefs ──────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GlobalEmailSection({
  prefs, mutate, setError,
}: {
  prefs:    Prefs;
  mutate:   MutatePrefsFn;
  setError: (s: string | null) => void;
}) {
  const [emailDraft, setEmailDraft] = useState<string>(prefs.email ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Keep draft in sync if the server pushes a fresh value.
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
        Email alerts
      </h2>
      <div className="rounded-xl border p-4"
        style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
        <PrefToggle
          label="Email me about unlocks"
          desc={prefs.email ? `Sent to ${prefs.email}` : "Set an email address below first."}
          value={prefs.emailEnabled}
          saving={saving === "emailEnabled"}
          onChange={setEnabled}
        />
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

function TestPushSection({ setError }: { setError: (s: string | null) => void }) {
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
        return;
      }
      setStatus("sent");
      setHint("Test push sent. Check your mobile device — it should arrive within a few seconds.");
    } catch (e) {
      setStatus("error");
      setHint(e instanceof Error ? e.message : "Failed to send");
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
