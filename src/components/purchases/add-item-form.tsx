"use client";

import { useActionState } from "react";
import { Plus } from "@phosphor-icons/react";
import {
  addPurchaseItem,
  type PurchaseItemFormState,
} from "@/server/actions/purchases";

const initialState: PurchaseItemFormState = { error: null };

const inputClass =
  "h-10 rounded-lg border border-outline-soft bg-white px-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

export default function AddItemForm({
  purchaseId,
  products,
}: {
  purchaseId: string;
  products: {
    id: string;
    name: string;
    grade: string;
    diameter_mm: number;
  }[];
}) {
  const [state, formAction, isPending] = useActionState(addPurchaseItem, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_auto]">
        <select
          name="product_id"
          required
          aria-label="Product"
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Product…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.diameter_mm}mm {p.grade}
            </option>
          ))}
        </select>
        <input
          name="measured_length_ft"
          required
          inputMode="decimal"
          placeholder="Length (ft)"
          aria-label="Measured length in feet"
          className={inputClass}
        />
        <input
          name="measured_weight_kg"
          required
          inputMode="decimal"
          placeholder="Weight (kg)"
          aria-label="Measured weight in kilograms"
          className={inputClass}
        />
        <input
          name="purchase_cost"
          required
          inputMode="decimal"
          placeholder="Cost (PKR)"
          aria-label="Purchase cost in PKR"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isPending}
          aria-label="Add shaft"
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-forest bg-forest px-3 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60 max-md:col-span-2"
        >
          <Plus size={16} weight="bold" />
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-sm text-error-ink"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
