"use client";

import { Printer } from "@phosphor-icons/react";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-11 items-center gap-2 rounded-lg border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sand"
    >
      <Printer size={18} />
      Print invoice
    </button>
  );
}
