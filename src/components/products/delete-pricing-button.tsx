"use client";

import { useTransition } from "react";
import { deletePricing } from "@/server/actions/products";

export default function DeletePricingButton({ pricingId }: { pricingId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (window.confirm("Remove this price row? Invoices already issued keep their snapshotted rates.")) {
          startTransition(() => deletePricing(pricingId));
        }
      }}
      className="rounded-md px-2 py-1 text-xs font-medium text-error-ink transition-colors hover:bg-error-soft/60 disabled:opacity-50"
    >
      {isPending ? "Removing…" : "Delete"}
    </button>
  );
}
