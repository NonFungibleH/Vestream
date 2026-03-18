"use client";
import { useState } from "react";

interface Props {
  keyId: string;
  keyPrefix: string;
}

export function RevokeButton({ keyId, keyPrefix }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleRevoke() {
    if (!confirm(`Revoke key ${keyPrefix}...? This cannot be undone.`)) return;
    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error ?? "Failed to revoke.");
        setState("error");
        return;
      }

      setState("done");
    } catch {
      setErrorMsg("Network error. Try again.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
        style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
        Revoked
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRevoke}
        disabled={state === "loading"}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.2)",
          color: "#f87171",
        }}
      >
        {state === "loading" ? "Revoking…" : "Revoke"}
      </button>
      {state === "error" && (
        <p className="text-xs" style={{ color: "#f87171" }}>{errorMsg}</p>
      )}
    </div>
  );
}
