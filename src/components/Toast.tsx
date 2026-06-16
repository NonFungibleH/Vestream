"use client";

// src/components/Toast.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight, dependency-free toast for the dashboard. Replaces the scattered
// inline "Saving…" / "Saved ✓" / "Refresh failed" status strings with a single
// consistent top-right notification.
//
// Usage: mount <ToastProvider> once (dashboard layout), then anywhere below:
//   const toast = useToast();
//   toast.success("Saved");           toast.error("Couldn't save");
//   toast.info("Refreshing…");        toast.show("Custom", "success");
//
// Toasts auto-dismiss (success/info 2.6s, error 4s) and stack top-right with a
// fade/slide. Styled with the dashboard --preview-* CSS vars so it themes with
// light/dark automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; msg: string; kind: ToastKind; }

interface ToastApi {
  show:    (msg: string, kind?: ToastKind) => void;
  success: (msg: string) => void;
  error:   (msg: string) => void;
  info:    (msg: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

/** Safe to call outside a provider — falls back to a no-op (logs in dev). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (ctx) return ctx;
  const noop = (msg: string) => { if (process.env.NODE_ENV !== "production") console.warn("[toast: no provider]", msg); };
  return { show: noop, success: noop, error: noop, info: noop };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    const ttl = kind === "error" ? 4000 : 2600;
    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const api: ToastApi = {
    show,
    success: useCallback((m: string) => show(m, "success"), [show]),
    error:   useCallback((m: string) => show(m, "error"),   [show]),
    info:    useCallback((m: string) => show(m, "info"),    [show]),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastCtx.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const accent =
    toast.kind === "success" ? "#0F8A8A" :
    toast.kind === "error"   ? "#dc2626" :
                               "#64748b";
  const glyph = toast.kind === "success" ? "✓" : toast.kind === "error" ? "✕" : "•";
  return (
    <button
      type="button"
      onClick={onClose}
      style={{
        pointerEvents: "auto",
        display: "flex", alignItems: "center", gap: 8,
        minWidth: 200, maxWidth: 340,
        padding: "10px 14px", borderRadius: 12, textAlign: "left",
        background: "var(--preview-card)",
        border: "1px solid var(--preview-border)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        animation: "toast-in 180ms ease-out",
      }}
    >
      <span style={{
        flexShrink: 0, width: 18, height: 18, borderRadius: 9,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "white", background: accent,
      }}>
        {glyph}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--preview-text)" }}>{toast.msg}</span>
    </button>
  );
}
