"use client";

import { useActionState, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { addSaleLine, type SaleLineFormState } from "@/server/actions/sales";
import { formatNumber, formatPkr } from "@/lib/format";

const initialState: SaleLineFormState = { error: null };

const inputClass =
  "h-10 rounded-lg border border-outline-soft bg-white px-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

export type PieceOption = {
  id: string;
  piece_code: string;
  status: string;
  measured_weight_kg: number;
  carrying_value: number;
  product_id: string;
  products: { name: string; grade: string; diameter_mm: number } | null;
};

export type LotOption = {
  id: string;
  lot_number: string;
  remaining_weight_kg: number;
  remaining_value: number;
  product_id: string | null;
  products: { name: string; grade: string; diameter_mm: number } | null;
};

export default function AddSaleLineForm({
  saleId,
  saleType,
  pieces,
  lots,
  rates,
}: {
  saleId: string;
  saleType: "full" | "cut" | "scrap";
  pieces: PieceOption[];
  lots: LotOption[];
  rates: Record<string, number>;
}) {
  const [state, formAction, isPending] = useActionState(addSaleLine, initialState);
  const [selectedId, setSelectedId] = useState("");
  const [rateRaw, setRateRaw] = useState("");
  const [weightRaw, setWeightRaw] = useState("");

  const isScrap = saleType === "scrap";

  const selectedPiece = isScrap ? null : pieces.find((p) => p.id === selectedId) ?? null;

  const effectiveWeight = isScrap
    ? Number(weightRaw)
    : selectedPiece
      ? Number(selectedPiece.measured_weight_kg)
      : NaN;
  const rate = Number(rateRaw);
  const amount =
    Number.isFinite(effectiveWeight) && effectiveWeight > 0 && Number.isFinite(rate) && rate >= 0
      ? Math.round(effectiveWeight * rate * 100) / 100
      : null;

  function handleSelect(id: string) {
    setSelectedId(id);
    if (!isScrap) {
      const piece = pieces.find((p) => p.id === id);
      const suggested = piece ? rates[piece.product_id] : undefined;
      setRateRaw(suggested !== undefined ? String(suggested) : "");
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sale_id" value={saleId} />
      {isScrap ? (
        <input type="hidden" name="scrap_lot_id" value={selectedId} />
      ) : (
        <input type="hidden" name="inventory_piece_id" value={selectedId} />
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.7fr_1fr_1fr_auto]">
        <select
          aria-label={isScrap ? "Scrap lot" : "Inventory piece"}
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            {isScrap ? "Scrap lot…" : saleType === "full" ? "Full shaft…" : "Cut piece…"}
          </option>
          {isScrap
            ? lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lot_number} · {formatNumber(lot.remaining_weight_kg)} kg ·{" "}
                  {formatPkr(lot.remaining_value)}
                </option>
              ))
            : pieces.map((piece) => (
                <option key={piece.id} value={piece.id}>
                  {piece.piece_code} · {piece.products?.name} — {piece.products?.diameter_mm}mm{" "}
                  {piece.products?.grade} · {formatNumber(piece.measured_weight_kg)} kg
                </option>
              ))}
        </select>

        <input
          name="rate"
          required
          inputMode="decimal"
          placeholder="Rate (PKR/kg)"
          aria-label="Rate in PKR per kilogram"
          value={rateRaw}
          onChange={(e) => setRateRaw(e.target.value)}
          className={inputClass}
        />

        {isScrap ? (
          <input
            name="weight_kg"
            required
            inputMode="decimal"
            placeholder="Weight (kg)"
            aria-label="Weight in kilograms"
            value={weightRaw}
            onChange={(e) => setWeightRaw(e.target.value)}
            className={inputClass}
          />
        ) : (
          <div
            className="flex h-10 items-center justify-end rounded-lg border border-sand bg-parchment px-2 text-sm tabular-nums text-ink-soft"
            aria-label="Weight in kilograms"
          >
            {selectedPiece ? `${formatNumber(selectedPiece.measured_weight_kg)} kg` : "—"}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !selectedId}
          aria-label="Add line"
          className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-forest bg-forest px-3 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60 max-md:col-span-2"
        >
          <Plus size={16} weight="bold" />
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>

      <p className="text-xs text-secondary">
        {amount !== null ? (
          <>
            Amount: <span className="font-semibold tabular-nums text-ink">{formatPkr(amount)}</span>
            {!isScrap ? " · weight is fixed to the piece measurement" : null}
            {!isScrap ? " · rate pre-filled from the price list (editable)" : null}
          </>
        ) : (
          <>
            {isScrap
              ? "Enter the weight to sell and the rate."
              : "Select a piece; the rate is pre-filled from the price list (editable)."}
          </>
        )}
      </p>

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
