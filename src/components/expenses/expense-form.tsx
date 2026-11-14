"use client";

import { useActionState } from "react";
import { postExpense, type ExpenseFormState } from "@/server/actions/expenses";

const initialState: ExpenseFormState = { error: null };

const methods = [
  { value: "cash", label: "Cash (paid now)" },
  { value: "bank_transfer", label: "Bank transfer (paid now)" },
  { value: "cheque", label: "Cheque (paid now)" },
  { value: "credit", label: "On account / unpaid (posts to Accounts Payable)" },
];

export default function ExpenseForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(postExpense, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category_id" className="text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="category_id"
            name="category_id"
            required
            defaultValue=""
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          >
            <option value="" disabled>
              Select category…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="expense_date" className="text-sm font-medium text-ink">
            Date
          </label>
          <input
            id="expense_date"
            name="expense_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div>
          <label htmlFor="amount" className="text-sm font-medium text-ink">
            Amount (PKR)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm tabular-nums text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div>
          <label htmlFor="method" className="text-sm font-medium text-ink">
            Method
          </label>
          <select
            id="method"
            name="method"
            required
            defaultValue="cash"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          >
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="payee" className="text-sm font-medium text-ink">
            Payee <span className="font-normal text-outline">(optional)</span>
          </label>
          <input
            id="payee"
            name="payee"
            placeholder="Who was paid…"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div>
          <label htmlFor="reference" className="text-sm font-medium text-ink">
            Reference <span className="font-normal text-outline">(optional)</span>
          </label>
          <input
            id="reference"
            name="reference"
            placeholder="Cheque no. / receipt ref…"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div>
          <label htmlFor="notes" className="text-sm font-medium text-ink">
            Notes <span className="font-normal text-outline">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            placeholder="Any note for the record…"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-4 py-3 text-sm text-error-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="flex h-12 items-center gap-2 rounded-lg bg-forest px-6 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Recording…" : "Record expense"}
        </button>
      </div>
    </form>
  );
}
