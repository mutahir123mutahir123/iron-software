"use client";

import { useActionState } from "react";
import { createCategory, type CategoryFormState } from "@/server/actions/categories";

const initialState: CategoryFormState = { error: null };

export default function CategoryForm() {
  const [state, formAction, isPending] = useActionState(createCategory, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="name" className="text-sm font-medium text-zinc-700">
        New category
      </label>
      <div className="flex gap-2">
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Saria, Angle, Channel, Pipe"
          className="h-11 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20"
        />
        <button
          type="submit"
          disabled={isPending}
          className="h-11 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-60"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-error-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
