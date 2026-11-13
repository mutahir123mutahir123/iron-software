"use client";

import { useActionState } from "react";
import { createPricing, type PricingFormState } from "@/server/actions/products";

const initialState: PricingFormState = { error: null };

const inputClass =
  "h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";
const labelClass = "text-sm font-medium text-zinc-700";

function todayIso() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function PricingForm({ productId }: { productId: string }) {
  const [state, formAction, isPending] = useActionState(createPricing, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="product_id" value={productId} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="full_rate" className={labelClass}>
            Full-length rate (PKR/kg)
          </label>
          <input
            id="full_rate"
            name="full_rate"
            required
            inputMode="decimal"
            placeholder="e.g. 210.00"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cut_rate" className={labelClass}>
            Cut-piece rate (PKR/kg)
          </label>
          <input
            id="cut_rate"
            name="cut_rate"
            required
            inputMode="decimal"
            placeholder="e.g. 225.00"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="effective_from" className={labelClass}>
            Effective from
          </label>
          <input
            id="effective_from"
            name="effective_from"
            type="date"
            required
            defaultValue={todayIso()}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="effective_to" className={labelClass}>
            Effective to{" "}
            <span className="font-normal text-zinc-400">(optional, open-ended)</span>
          </label>
          <input
            id="effective_to"
            name="effective_to"
            type="date"
            className={inputClass}
          />
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

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="h-11 rounded-lg border border-zinc-900 px-4 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Add price row"}
        </button>
      </div>
    </form>
  );
}
