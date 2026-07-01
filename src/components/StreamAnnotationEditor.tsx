"use client";

// ─────────────────────────────────────────────────────────────────────────────
// src/components/StreamAnnotationEditor.tsx
//
// Inline editor for a single stream's custom name + notes.
//
// UX:
//   - Compact "view" mode shows current name/notes (or "Add note") with a
//     pencil button to enter edit mode.
//   - Edit mode reveals two inputs: a single-line "name" (cap 80) and a
//     short textarea for notes (cap 200). Live char counter on each.
//   - Save/Cancel pair below. Optimistic update via SWR mutate after PUT.
//
// Caps are hardcoded to match the API server-side enforcement
// (STREAM_ANNOTATION_NAME_MAX, STREAM_ANNOTATION_NOTES_MAX). If the server
// caps change, change here too.
//
// Mounted inside the expanded vesting-table row, so it's only fetched/
// rendered when the user actually expands a stream.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";

const NAME_MAX  = 80;
const NOTES_MAX = 200;

interface Annotation {
  streamId:   string;
  customName: string | null;
  notes:      string | null;
  updatedAt:  string;  // ISO from JSON roundtrip
}

interface Props {
  streamId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function StreamAnnotationEditor({ streamId }: Props) {
  // Per-stream fetch – cheap because the expanded row is the only place
  // this component mounts. SWR caches across remounts within the session.
  const { data, mutate, isLoading } = useSWR<{ annotation: Annotation | null }>(
    `/api/streams/${encodeURIComponent(streamId)}/annotation`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const annotation = data?.annotation ?? null;

  const [editing, setEditing] = useState(false);
  const [nameDraft,  setNameDraft]  = useState(annotation?.customName ?? "");
  const [notesDraft, setNotesDraft] = useState(annotation?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Sync local draft state when SWR data lands / changes (avoid clobbering
  // user keystrokes mid-edit – only sync when not actively editing).
  useEffect(() => {
    if (!editing) {
      setNameDraft(annotation?.customName ?? "");
      setNotesDraft(annotation?.notes ?? "");
    }
  }, [annotation, editing]);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) nameRef.current?.focus(); }, [editing]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const trimmedName  = nameDraft.trim();
      const finalName    = trimmedName.length > 0  ? trimmedName  : null;
      const finalNotes   = notesDraft.length > 0   ? notesDraft   : null;
      const res = await fetch(`/api/streams/${encodeURIComponent(streamId)}/annotation`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({ customName: finalName, notes: finalNotes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      // Optimistic-shape revalidation. SWR will coalesce with the response.
      await mutate({ annotation: body.annotation }, { revalidate: false });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setNameDraft(annotation?.customName ?? "");
    setNotesDraft(annotation?.notes ?? "");
    setError(null);
    setEditing(false);
  }

  if (isLoading) {
    return (
      <div className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
        Loading…
      </div>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────
  if (!editing) {
    const hasName  = !!annotation?.customName;
    const hasNotes = !!annotation?.notes;

    return (
      <div className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5"
        style={{ background: "var(--preview-card-2)", border: "1px solid var(--preview-border-2)" }}>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1"
             style={{ color: "var(--preview-text-3)" }}>
            Notes
          </p>
          {hasName && (
            <p className="text-sm font-semibold mb-0.5 break-words"
               style={{ color: "var(--preview-text)" }}>
              {annotation!.customName}
            </p>
          )}
          {hasNotes ? (
            <p className="text-xs leading-relaxed break-words whitespace-pre-wrap"
               style={{ color: "var(--preview-text-2)" }}>
              {annotation!.notes}
            </p>
          ) : !hasName ? (
            <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
              No notes yet – add a custom name or context to help distinguish this stream.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md flex-shrink-0 transition-colors"
          style={{
            background: "rgba(28,184,184,0.10)",
            border: "1px solid rgba(28,184,184,0.22)",
            color: "#0F8A8A",
          }}
        >
          {hasName || hasNotes ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  // ── Edit mode ────────────────────────────────────────────────────────────
  const nameOver  = nameDraft.length  > NAME_MAX;
  const notesOver = notesDraft.length > NOTES_MAX;

  return (
    <div className="rounded-xl px-3 py-3 space-y-2.5"
      style={{ background: "var(--preview-card-2)", border: "1px solid var(--preview-border-2)" }}
      onClick={(e) => e.stopPropagation()}>
      <p className="text-[10px] font-semibold uppercase tracking-widest"
         style={{ color: "var(--preview-text-3)" }}>
        Notes
      </p>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium" style={{ color: "var(--preview-text-2)" }}>
            Custom name
          </label>
          <span className="text-[10px] tabular-nums"
                style={{ color: nameOver ? "#dc2626" : "var(--preview-text-3)" }}>
            {nameDraft.length}/{NAME_MAX}
          </span>
        </div>
        <input
          ref={nameRef}
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value.slice(0, NAME_MAX + 20))}
          placeholder="e.g. Series A – Acme Capital allocation"
          className="w-full text-sm px-3 py-2 rounded-md outline-none focus:ring-2"
          style={{
            background: "var(--preview-card)",
            border: `1px solid ${nameOver ? "#dc2626" : "var(--preview-border-2)"}`,
            color: "var(--preview-text)",
          }}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-medium" style={{ color: "var(--preview-text-2)" }}>
            Notes (200 chars)
          </label>
          <span className="text-[10px] tabular-nums"
                style={{ color: notesOver ? "#dc2626" : "var(--preview-text-3)" }}>
            {notesDraft.length}/{NOTES_MAX}
          </span>
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value.slice(0, NOTES_MAX + 20))}
          placeholder="Anything that helps you distinguish this stream – issuer, deal terms, tax notes…"
          rows={3}
          className="w-full text-xs px-3 py-2 rounded-md outline-none focus:ring-2 resize-none"
          style={{
            background: "var(--preview-card)",
            border: `1px solid ${notesOver ? "#dc2626" : "var(--preview-border-2)"}`,
            color: "var(--preview-text)",
            lineHeight: 1.5,
          }}
        />
      </div>

      {error && (
        <p className="text-[11px]" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
          style={{
            background: "transparent",
            color: "var(--preview-text-2)",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || nameOver || notesOver}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
          style={{
            background: "#1CB8B8",
            color: "white",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
