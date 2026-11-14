"use client";

import { useActionState } from "react";
import {
  createSaleDraft,
  updateSaleDraft,
  type SaleFormState,
} from "@/server/actions/sales";

export type SaleFormValues = {
  id: string;
  customer_id: string;
  sale_date: string;
  notes: string;
};

type CustomerOption = { id: string; name: string };

const initialState: SaleFormState = { error: null };

const inputClass =
  "h-11 rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";
const labelClass = "text-sm font-medium text-ink-soft";

export default function SaleForm({
  customers,
  values,
}: {
  customers: CustomerOption[];
  values?: SaleFormValues;
}) {
  const isEdit = Boolean(values);
  const [state, formAction, isPending] = useActionState(
    isEdit ? updateSaleDraft : createSaleDraft,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isEdit ? <input type="hidden" name="id" value={values?.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>Sale type</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Sale type">
              {[
                { value: "full", label: "Full shaft" },
                { value: "cut", label: "Cut piece" },
                { value: "scrap", label: "Scrap" },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center justify-center rounded-lg border border-outline-soft px-3 py-3 text-center text-sm font-medium text-ink-soft transition-colors has-[:checked]:border-forest has-[:checked]:bg-forest-fixed has-[:checked]:text-forest-ink"
                >
                  <input
                    type="radio"
                    name="sale_type"
                    value={option.value}
                    required
                    defaultChecked={option.value === "full"}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-outline">
              Every invoice carries one type. Mixing types requires separate invoices.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="customer_id" className={labelClass}>
            Customer <span aria-hidden="true">*</span>
          </label>
          <select
            id="customer_id"
            name="customer_id"
            required
            defaultValue={values?.customer_id ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sale_date" className={labelClass}>
            Sale date <span aria-hidden="true">*</span>
          </label>
          <input
            id="sale_date"
            name="sale_date"
            type="date"
            required
            defaultValue={values?.sale_date ?? new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={values?.notes ?? ""}
            className="rounded-lg border border-outline-soft bg-white px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
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
          className="h-11 rounded-lg bg-forest px-5 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create invoice draft"}
        </button>
      </div>
    </form>
  );
}
