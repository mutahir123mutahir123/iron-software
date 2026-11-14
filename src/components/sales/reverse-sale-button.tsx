"use client";

import { useActionState, useState } from "react";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { reverseSale, type SaleFormState } from "@/server/actions/sales";

const initialState: SaleFormState = { error: null };

export default function ReverseSaleButton({
  saleId,
  saleNumber,
  lineCount,
}: {
  saleId: string;
  saleNumber: string;
  lineCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(reverseSale, initialState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-2 rounded-lg border border-error/40 bg-error-soft/40 px-4 text-sm font-semibold text-error-ink transition-colors hover:bg-error-soft"
      >
        <ArrowCounterClockwise size={18} />
        Reverse sale
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error-soft/40 p-4"
    >
      <input type="hidden" name="sale_id" value={saleId} />
      <div className="flex items-start gap-2">
        <WarningCircle size={20} className="mt-0.5 shrink-0 text-error-ink" weight="fill" />
        <div className="text-sm text-ink">
          <p className="font-semibold">Reverse {saleNumber}?</p>
          <p className="mt-1 text-ink-soft">
            Stock for the {lineCount} line{lineCount === 1 ? "" : "s"} is restored and a
            compensating journal entry is posted (credit note). The original invoice is kept
            for history. Payments already allocated to this invoice must be reversed
            separately in Payments &amp; Expenses.
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-sm text-error-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-11 rounded-lg bg-error px-5 text-sm font-semibold text-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Reversing…" : "Yes, reverse"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="h-11 rounded-lg border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sand disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
