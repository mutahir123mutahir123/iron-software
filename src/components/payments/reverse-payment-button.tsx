"use client";

import { useActionState, useState } from "react";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { reversePayment, type PaymentFormState } from "@/server/actions/payments";

const initialState: PaymentFormState = { error: null };

export default function ReversePaymentButton({
  paymentId,
  paymentNumber,
  allocationCount,
}: {
  paymentId: string;
  paymentNumber: string;
  allocationCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(reversePayment, initialState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-2 rounded-lg border border-error/40 bg-error-soft/40 px-4 text-sm font-semibold text-error-ink transition-colors hover:bg-error-soft"
      >
        <ArrowCounterClockwise size={18} />
        Reverse payment
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error-soft/40 p-4"
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <div className="flex items-start gap-2">
        <WarningCircle size={20} className="mt-0.5 shrink-0 text-error-ink" weight="fill" />
        <div className="text-sm text-ink">
          <p className="font-semibold">Reverse {paymentNumber}?</p>
          <p className="mt-1 text-ink-soft">
            A compensating journal entry is posted for the payment and every allocation it
            carries ({allocationCount} allocation{allocationCount === 1 ? "" : "s"}). The payment
            and its allocations are kept for history; open invoice/bill balances and advances
            are recalculated from the remaining posted payments.
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
