"use client";

import { useState } from "react";
import ContactModal from "./ContactModal";

export default function ContactTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-semibold transition-colors hover:opacity-80"
        style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "inherit" }}
      >
        Talk to us →
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
