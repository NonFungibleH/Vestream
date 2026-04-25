"use client";

import { useState } from "react";
import ContactModal from "./ContactModal";

interface ContactTriggerProps {
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_STYLE: React.CSSProperties = {
  color: "#1CB8B8",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  fontSize: "inherit",
};

export default function ContactTrigger({ label, className, style }: ContactTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "font-semibold transition-colors hover:opacity-80"}
        style={style ?? DEFAULT_STYLE}
      >
        {label ?? "Talk to us →"}
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
