"use client";

import { useActionState, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { confirmSale, type SaleFormState } from "@/server/actions/sales";

const initialState: SaleFormState = { error: null };

export default function ConfirmSaleButton({
  saleId,
  total,
  lineCount,
}: {
  saleId: string;
  total: string;
  lineCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(confirmSale, initialState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-2 rounded-lg bg-forest px-5 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
      >
        <CheckCircle size={18} weight="fill" />
        Confirm sale
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-forest/30 bg-forest-fixed/40 p-4"
    >
      <input type="hidden" name="sale_id" value={saleId} />
      <div className="flex items-start gap-2">
        <WarningCircle size={20} className="mt-0.5 shrink-0 text-forest" weight="fill" />
        <div className="text-sm text-ink">
          <p className="font-semibold">Confirm this sale?</p>
          <p className="mt-1 text-ink-soft">
            {lineCount} line{lineCount === 1 ? "" : "s"} totalling {total} will post to stock
            and accounting. Stock will be reduced, pieces marked sold and the Accounts
            Receivable and COGS journal entries will be created. A confirmed sale cannot be
            edited or deleted.
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
          className="h-11 rounded-lg bg-forest px-5 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Confirming…" : "Yes, confirm"}
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
