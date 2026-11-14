"use client";

import { useState, useTransition } from "react";
import { Trash } from "@phosphor-icons/react";
import { deleteExpenseCategory } from "@/server/actions/expenses";

export default function DeleteCategoryButton({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        aria-label={`Delete category ${categoryName}`}
        title="Delete category"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-error/30 text-error-ink transition-colors hover:bg-error-soft"
      >
        <Trash size={16} />
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteExpenseCategory(categoryId);
              if (result.error) {
                setError(result.error);
                setConfirming(false);
                return;
              }
              setConfirming(false);
            })
          }
          className="h-9 rounded-lg bg-error px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Deleting…" : "Confirm"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="h-9 rounded-lg border border-outline-soft px-3 text-xs font-medium text-ink-soft hover:bg-sand disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-error-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
