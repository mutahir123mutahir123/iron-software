"use client";

import { useActionState } from "react";
import {
  createSupplier,
  updateSupplier,
  type SupplierFormState,
} from "@/server/actions/suppliers";

export type SupplierFormValues = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
  is_active: boolean;
};

const initialState: SupplierFormState = { error: null };

const inputClass =
  "h-11 rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";
const labelClass = "text-sm font-medium text-ink-soft";

export default function SupplierForm({ values }: { values?: SupplierFormValues }) {
  const isEdit = Boolean(values);
  const [state, formAction, isPending] = useActionState(
    isEdit ? updateSupplier : createSupplier,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isEdit ? <input type="hidden" name="id" value={values?.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="name" className={labelClass}>
            Supplier name <span aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={values?.name ?? ""}
            placeholder="e.g. Karachi Steel Traders"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            defaultValue={values?.phone ?? ""}
            placeholder="e.g. 0300-1234567"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="address" className={labelClass}>
            Address
          </label>
          <input
            id="address"
            name="address"
            defaultValue={values?.address ?? ""}
            placeholder="e.g. Plot 42, SITE Area, Karachi"
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

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={values?.is_active ?? true}
            className="h-4 w-4 accent-forest"
          />
          Active (available for purchases)
        </label>
      ) : null}

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
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Add supplier"}
        </button>
      </div>
    </form>
  );
}
