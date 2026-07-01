"use client";

// ─────────────────────────────────────────────────────────────────────────────
// src/components/StreamTagsEditor.tsx
//
// Tag editor for a single stream. Sister to <StreamAnnotationEditor>.
//
// View mode: shows current tags as colour-coded chips, with an "+ Add" pill
// that opens a quick text input.
//
// Edit mode (per chip): backspace on empty input removes the last chip.
// Enter or comma submits the current input as a new tag.
//
// Tag values are lowercase-normalised on the server, but display them
// title-cased here for readability.
//
// Caps mirror server enforcement: 30 chars per tag, 10 tags per stream.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";

const TAG_MAX_LEN     = 30;
const TAGS_PER_STREAM = 10;

// Deterministic colour from tag string. Same palette as token colours so
// the dashboard reads consistently. Calling site can override per-tag.
const PALETTE = [
  "#1CB8B8", "#F0992E", "#8169E0", "#28B895",
  "#E063A0", "#3D7FD0", "#0BA0CB", "#F0B83D",
  "#A26B3F", "#5DCE9D", "#dc2626", "#7c3aed",
];
function colourForTag(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Tag {
  streamId: string;
  tag:      string;
  color:    string | null;
}

interface Props {
  streamId: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function StreamTagsEditor({ streamId }: Props) {
  const { data, mutate, isLoading } = useSWR<{ tags: Tag[] }>(
    `/api/streams/${encodeURIComponent(streamId)}/tags`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const tags = data?.tags ?? [];

  const [input, setInput]   = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function persist(nextTags: Array<{ tag: string; color: string | null }>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/streams/${encodeURIComponent(streamId)}/tags`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body:    JSON.stringify({ tags: nextTags }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body = await res.json();
      await mutate({ tags: body.tags }, { revalidate: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addTag() {
    const cleaned = input.trim().toLowerCase();
    if (!cleaned) {
      setAdding(false);
      return;
    }
    if (cleaned.length > TAG_MAX_LEN) {
      setError(`Tag too long – ${TAG_MAX_LEN} chars max`);
      return;
    }
    if (tags.length >= TAGS_PER_STREAM) {
      setError(`Max ${TAGS_PER_STREAM} tags per stream`);
      return;
    }
    if (tags.some((t) => t.tag === cleaned)) {
      setInput("");
      setAdding(false);
      return;
    }
    const next = [...tags.map((t) => ({ tag: t.tag, color: t.color })), { tag: cleaned, color: null }];
    setInput("");
    setAdding(false);
    await persist(next);
  }

  async function removeTag(tag: string) {
    const next = tags.filter((t) => t.tag !== tag).map((t) => ({ tag: t.tag, color: t.color }));
    await persist(next);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInput("");
      setAdding(false);
      setError(null);
    } else if (e.key === "Backspace" && input.length === 0 && tags.length > 0) {
      // Backspace on empty input removes the last tag (standard chip-input UX).
      e.preventDefault();
      removeTag(tags[tags.length - 1].tag);
    }
  }

  if (isLoading) {
    return (
      <div className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
        Loading tags…
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center flex-wrap gap-1.5 rounded-xl px-3 py-2"
      style={{ background: "var(--preview-card-2)", border: "1px solid var(--preview-border-2)" }}
    >
      <span
        className="text-[10px] font-semibold uppercase tracking-widest mr-1"
        style={{ color: "var(--preview-text-3)" }}
      >
        Tags
      </span>

      {tags.map((t) => {
        const c = t.color ?? colourForTag(t.tag);
        return (
          <span
            key={t.tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold"
            style={{
              background:  c + "1F",
              color:       c,
              border:      `1px solid ${c}40`,
            }}
            title={`Remove "${titleCase(t.tag)}"`}
          >
            {titleCase(t.tag)}
            <button
              type="button"
              onClick={() => removeTag(t.tag)}
              disabled={saving}
              aria-label={`Remove tag ${t.tag}`}
              className="opacity-60 hover:opacity-100 transition-opacity"
              style={{
                color:       c,
                background:  "transparent",
                border:      "none",
                lineHeight:  1,
                padding:     0,
                marginLeft:  2,
                fontSize:    11,
                fontWeight:  700,
                cursor:      saving ? "not-allowed" : "pointer",
              }}
            >
              ×
            </button>
          </span>
        );
      })}

      {adding ? (
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, TAG_MAX_LEN + 5))}
          onBlur={addTag}
          onKeyDown={onKey}
          placeholder="tag…"
          className="text-[11px] px-2 py-0.5 rounded-md outline-none"
          style={{
            background:  "var(--preview-card)",
            border:      "1px solid var(--preview-border-2)",
            color:       "var(--preview-text)",
            minWidth:    60,
            maxWidth:    140,
          }}
        />
      ) : tags.length < TAGS_PER_STREAM ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={saving}
          className="text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors"
          style={{
            background:  "rgba(28,184,184,0.10)",
            border:      "1px solid rgba(28,184,184,0.22)",
            color:       "#0F8A8A",
          }}
        >
          + Add
        </button>
      ) : null}

      {error && (
        <span className="text-[11px] ml-2" style={{ color: "#dc2626" }}>
          {error}
        </span>
      )}
    </div>
  );
}
