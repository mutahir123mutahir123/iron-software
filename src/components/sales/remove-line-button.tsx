"use client";

import { useTransition } from "react";
import { Trash } from "@phosphor-icons/react";
import { removeSaleLine } from "@/server/actions/sales";

export default function RemoveLineButton({ lineId }: { lineId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label="Remove line"
      onClick={() => startTransition(() => removeSaleLine(lineId))}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-outline transition-colors hover:bg-error-soft hover:text-error disabled:opacity-50"
    >
      <Trash size={17} />
    </button>
  );
}
