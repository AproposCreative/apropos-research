"use client";
import { useState } from "react";
import { ClipboardCopy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm hover:underline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Kopier til udklipsholder"
    >
      <ClipboardCopy size={14} /> {copied ? "Kopieret!" : "Kopiér prompt"}
    </button>
  );
}


