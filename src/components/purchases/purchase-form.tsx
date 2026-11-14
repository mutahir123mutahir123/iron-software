"use client";

import { useActionState } from "react";
import {
  createPurchaseDraft,
  updatePurchaseDraft,
  type PurchaseFormState,
} from "@/server/actions/purchases";

export type PurchaseFormValues = {
  id: string;
  supplier_id: string;
  purchase_date: string;
  reference: string;
  additional_costs: string;
  notes: string;
};

const initialState: PurchaseFormState = { error: null };

const inputClass =
  "h-11 rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";
const labelClass = "text-sm font-medium text-ink-soft";

function todayIso() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function PurchaseForm({
  suppliers,
  values,
}: {
  suppliers: { id: string; name: string }[];
  values?: PurchaseFormValues;
}) {
  const isEdit = Boolean(values);
  const [state, formAction, isPending] = useActionState(
    isEdit ? updatePurchaseDraft : createPurchaseDraft,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isEdit ? <input type="hidden" name="id" value={values?.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="supplier_id" className={labelClass}>
            Supplier <span aria-hidden="true">*</span>
          </label>
          <select
            id="supplier_id"
            name="supplier_id"
            required
            defaultValue={values?.supplier_id ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Select supplier…
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="purchase_date" className={labelClass}>
            Purchase date <span aria-hidden="true">*</span>
          </label>
          <input
            id="purchase_date"
            name="purchase_date"
            type="date"
            required
            defaultValue={values?.purchase_date ?? todayIso()}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reference" className={labelClass}>
            Supplier reference / invoice no.
          </label>
          <input
            id="reference"
            name="reference"
            defaultValue={values?.reference ?? ""}
            placeholder="e.g. INV-1042"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="additional_costs" className={labelClass}>
            Additional landed costs — freight, handling (PKR)
          </label>
          <input
            id="additional_costs"
            name="additional_costs"
            inputMode="decimal"
            defaultValue={values?.additional_costs ?? "0"}
            placeholder="e.g. 1500.00"
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
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
