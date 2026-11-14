"use client";

import { useActionState, useState } from "react";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { reverseExpense, type ExpenseFormState } from "@/server/actions/expenses";

const initialState: ExpenseFormState = { error: null };

export default function ReverseExpenseButton({
  expenseId,
  amountLabel,
}: {
  expenseId: string;
  amountLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(reverseExpense, initialState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Reverse expense"
        title="Reverse expense"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-error/30 text-error-ink transition-colors hover:bg-error-soft"
      >
        <ArrowCounterClockwise size={17} />
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-error/30 bg-error-soft/40 p-3"
    >
      <input type="hidden" name="expense_id" value={expenseId} />
      <div className="flex items-start gap-2">
        <WarningCircle size={18} className="mt-0.5 shrink-0 text-error-ink" weight="fill" />
        <p className="text-xs text-ink-soft">
          Reverse this expense of <span className="font-semibold text-ink">{amountLabel}</span>? A
          compensating journal entry is posted and the original is kept for history.
        </p>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-xs text-error-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 rounded-lg bg-error px-4 text-xs font-semibold text-white transition-colors hover:bg-error/90 disabled:opacity-60"
        >
          {isPending ? "Reversing…" : "Yes, reverse"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="h-9 rounded-lg border border-outline-soft px-3 text-xs font-medium text-ink-soft transition-colors hover:bg-sand disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
