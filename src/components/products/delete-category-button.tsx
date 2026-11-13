"use client";

import { useState, useTransition } from "react";
import { deleteCategory } from "@/server/actions/categories";

export default function DeleteCategoryButton({ categoryId }: { categoryId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          if (window.confirm("Delete this category?")) {
            startTransition(async () => {
              const result = await deleteCategory(categoryId);
              setError(result.error);
            });
          }
        }}
        className="rounded-md px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error ? (
        <span role="alert" className="mt-1 max-w-56 text-right text-xs text-red-700 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </span>
  );
}
