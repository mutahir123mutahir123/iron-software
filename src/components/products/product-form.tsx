"use client";

import { useActionState } from "react";
import {
  createProduct,
  updateProduct,
  type ProductFormState,
} from "@/server/actions/products";

export type ProductFormValues = {
  id?: string;
  name: string;
  grade: string;
  category_id: string | null;
  diameter_mm: string;
  wall_thickness_mm: string;
  standard_length_ft: string;
  theoretical_weight_per_ft: string;
  notes: string;
  is_active: boolean;
};

const emptyValues: ProductFormValues = {
  name: "",
  grade: "",
  category_id: null,
  diameter_mm: "",
  wall_thickness_mm: "",
  standard_length_ft: "",
  theoretical_weight_per_ft: "",
  notes: "",
  is_active: true,
};

const initialState: ProductFormState = { error: null };

const inputClass =
  "h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const labelClass = "text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function ProductForm({
  categories,
  values,
}: {
  categories: { id: string; name: string }[];
  values?: ProductFormValues;
}) {
  const isEdit = Boolean(values?.id);
  const v = values ?? emptyValues;
  const [state, formAction, isPending] = useActionState(
    isEdit ? updateProduct : createProduct,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isEdit ? <input type="hidden" name="id" value={v.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="name" className={labelClass}>
            Product name <span aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={v.name}
            placeholder="e.g. 16mm Saria — 40ft"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="grade" className={labelClass}>
            Grade / material <span aria-hidden="true">*</span>
          </label>
          <input
            id="grade"
            name="grade"
            required
            defaultValue={v.grade}
            placeholder="e.g. Grade 60, Fe 500"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="category_id" className={labelClass}>
            Category
          </label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={v.category_id ?? ""}
            className={inputClass}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="diameter_mm" className={labelClass}>
            Diameter (mm) <span aria-hidden="true">*</span>
          </label>
          <input
            id="diameter_mm"
            name="diameter_mm"
            required
            inputMode="decimal"
            defaultValue={v.diameter_mm}
            placeholder="e.g. 16"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="wall_thickness_mm" className={labelClass}>
            Wall thickness (mm)
          </label>
          <input
            id="wall_thickness_mm"
            name="wall_thickness_mm"
            inputMode="decimal"
            defaultValue={v.wall_thickness_mm}
            placeholder="Optional — pipes/tubes"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="standard_length_ft" className={labelClass}>
            Standard length (ft) <span aria-hidden="true">*</span>
          </label>
          <input
            id="standard_length_ft"
            name="standard_length_ft"
            required
            inputMode="decimal"
            defaultValue={v.standard_length_ft}
            placeholder="e.g. 40"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="theoretical_weight_per_ft" className={labelClass}>
            Theoretical weight / ft (kg) <span aria-hidden="true">*</span>
          </label>
          <input
            id="theoretical_weight_per_ft"
            name="theoretical_weight_per_ft"
            required
            inputMode="decimal"
            defaultValue={v.theoretical_weight_per_ft}
            placeholder="e.g. 2.6700"
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
            defaultValue={v.notes}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      </div>

      {isEdit ? (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={v.is_active}
            className="h-4 w-4 accent-amber-600"
          />
          Active (available for purchases, cutting and sales)
        </label>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400"
        >
          {state.error}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="h-11 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-600 dark:text-zinc-950 dark:hover:bg-amber-500"
        >
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}
