"use client";

import { useTransition } from "react";
import { Trash } from "@phosphor-icons/react";
import { removePurchaseItem } from "@/server/actions/purchases";

export default function DeleteItemButton({ itemId }: { itemId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label="Remove item"
      onClick={() => startTransition(() => removePurchaseItem(itemId))}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-outline transition-colors hover:bg-error-soft hover:text-error disabled:opacity-50"
    >
      <Trash size={17} />
    </button>
  );
}
