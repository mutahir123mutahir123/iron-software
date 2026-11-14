"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "@phosphor-icons/react";
import { deleteSupplier } from "@/server/actions/suppliers";

export default function DeleteSupplierButton({ supplierId }: { supplierId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        Delete supplier
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await deleteSupplier(supplierId);
              if (result.error) {
                setError(result.error);
                setConfirming(false);
                return;
              }
              router.push("/suppliers");
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
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-sm text-error-ink"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
