"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { deleteSaleDraft } from "@/server/actions/sales";

export default function DeleteSaleButton({ saleId }: { saleId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-2 rounded-lg border border-error/30 px-4 text-sm font-medium text-error transition-colors hover:bg-error-soft"
      >
        <Trash size={17} />
        Delete draft
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteSaleDraft(saleId);
            router.push("/sales");
          })
        }
        className="flex h-11 items-center gap-2 rounded-lg bg-error px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Deleting…" : "Confirm delete"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(false)}
        className="h-11 rounded-lg border border-outline-soft px-4 text-sm font-medium text-ink-soft hover:bg-sand disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );
}
