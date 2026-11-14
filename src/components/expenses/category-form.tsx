"use client";

import { useActionState } from "react";
import { Plus } from "@phosphor-icons/react";
import { addExpenseCategory, type ExpenseFormState } from "@/server/actions/expenses";

const initialState: ExpenseFormState = { error: null };

export default function CategoryForm() {
  const [state, formAction, isPending] = useActionState(addExpenseCategory, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="name" className="text-sm font-medium text-ink">
        New category
      </label>
      <div className="flex gap-2">
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Marketing, Salaries, Repairs"
          className="h-11 flex-1 rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex h-11 items-center gap-1.5 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:opacity-60"
        >
          <Plus size={16} weight="bold" />
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-[11px] text-outline">
        New categories post to 6190 Miscellaneous Expense unless the accountant maps them.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-error-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
