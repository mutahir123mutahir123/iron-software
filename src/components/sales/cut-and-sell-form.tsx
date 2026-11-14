"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CheckCircle,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { createCutAndSellSale, type SaleFormState } from "@/server/actions/sales";
import { formatNumber, formatPkr } from "@/lib/format";
import type { CuttablePiece } from "@/components/cutting/new-cutting-form";

const initialState: SaleFormState = { error: null };

const inputClass =
  "h-10 rounded-lg border border-outline-soft bg-white px-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

type CustomerOption = { id: string; name: string };
type OutputRow = { length_ft: string; weight_kg: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function CutAndSellForm({
  pieces,
  customers,
  rates,
}: {
  pieces: CuttablePiece[];
  customers: CustomerOption[];
  rates: Record<string, number>;
}) {
  const [state, formAction, isPending] = useActionState(createCutAndSellSale, initialState);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [sourceId, setSourceId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [saleDate, setSaleDate] = useState(today);
  const [rateRaw, setRateRaw] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [outputs, setOutputs] = useState<OutputRow[]>([
    { length_ft: "", weight_kg: "" },
    { length_ft: "", weight_kg: "" },
  ]);
  const [scrapKgRaw, setScrapKgRaw] = useState("");
  const [soldIndex, setSoldIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const source = pieces.find((p) => p.id === sourceId) ?? null;

  const parsedOutputs = outputs.map((row) => ({
    length_ft: Number(row.length_ft),
    weight_kg: Number(row.weight_kg),
  }));
  const rowsValid = outputs.every(
    (row) =>
      Number.isFinite(Number(row.length_ft)) &&
      Number(row.length_ft) > 0 &&
      Number.isFinite(Number(row.weight_kg)) &&
      Number(row.weight_kg) > 0,
  );
  const totalOutKg = parsedOutputs.reduce(
    (sum, o) => sum + (Number.isFinite(o.weight_kg) ? o.weight_kg : 0),
    0,
  );
  const scrapKg = scrapKgRaw.trim() === "" ? 0 : Number(scrapKgRaw);
  const scrapValid = Number.isFinite(scrapKg) && scrapKg >= 0;

  const sourceValue = source ? Number(source.carrying_value) : 0;
  const sourceKg = source ? Number(source.measured_weight_kg) : 0;
  const varianceKg = source && rowsValid && scrapValid ? sourceKg - totalOutKg - scrapKg : null;

  let scrapValue = 0;
  let lossValue = 0;
  let pot = 0;
  if (source && rowsValid && scrapValid && varianceKg !== null) {
    if (varianceKg >= 0) {
      scrapValue = scrapKg > 0 ? round2((sourceValue * scrapKg) / sourceKg) : 0;
      lossValue = varianceKg > 0 ? round2((sourceValue * varianceKg) / sourceKg) : 0;
      pot = sourceValue - scrapValue - lossValue;
    } else {
      scrapValue = scrapKg > 0 ? round2((sourceValue * scrapKg) / (totalOutKg + scrapKg)) : 0;
      pot = sourceValue - scrapValue;
    }
  }

  const allocations: number[] = [];
  let remainingPot = pot;
  for (let i = 0; i < parsedOutputs.length; i++) {
    if (i === parsedOutputs.length - 1) {
      allocations.push(remainingPot);
      break;
    }
    const share = Math.min(
      round2((pot * parsedOutputs[i].weight_kg) / totalOutKg),
      remainingPot,
    );
    allocations.push(share);
    remainingPot = round2(remainingPot - share);
  }

  const rate = Number(rateRaw);
  const rateValid = rateRaw.trim() !== "" && Number.isFinite(rate) && rate >= 0;
  const soldWeight = rowsValid ? parsedOutputs[soldIndex]?.weight_kg ?? 0 : 0;
  const soldAmount = rateValid ? round2(soldWeight * rate) : null;

  const formValid =
    Boolean(source) &&
    Boolean(customerId) &&
    rowsValid &&
    scrapValid &&
    rateValid &&
    soldIndex < outputs.length;
  const hiddenOutputs = JSON.stringify(parsedOutputs);

  function updateOutput(index: number, patch: Partial<OutputRow>) {
    setOutputs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setConfirming(false);
  }

  function addOutput() {
    setOutputs((rows) => [...rows, { length_ft: "", weight_kg: "" }]);
    setConfirming(false);
  }

  function removeOutput(index: number) {
    setOutputs((rows) => rows.filter((_, i) => i !== index));
    setSoldIndex(0);
    setConfirming(false);
  }

  function handleSourceChange(id: string) {
    setSourceId(id);
    const piece = pieces.find((p) => p.id === id);
    const suggested = piece?.product_id ? rates[piece.product_id] : undefined;
    setRateRaw(suggested !== undefined ? String(suggested) : "");
    setConfirming(false);
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-5">
      <section className="flex flex-col gap-6 lg:col-span-3">
        <input type="hidden" name="outputs" value={hiddenOutputs} />
        <input type="hidden" name="sold_output_index" value={String(soldIndex)} />

        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Source piece</h2>
          <p className="mt-1 text-xs text-secondary">
            The customer buys a length cut from this piece. The cut and the sale are recorded
            in one atomic transaction.
          </p>
          <select
            name="source_piece_id"
            required
            aria-label="Source piece"
            value={sourceId}
            onChange={(e) => handleSourceChange(e.target.value)}
            className={`${inputClass} mt-3 h-11 w-full`}
          >
            <option value="">Select a piece…</option>
            {pieces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.piece_code} · {p.products?.name} — {p.products?.diameter_mm}mm{" "}
                {p.products?.grade} · {formatNumber(p.measured_weight_kg)} kg ·{" "}
                {formatPkr(p.carrying_value)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Sale details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-ink">Customer</span>
              <select
                name="customer_id"
                required
                aria-label="Customer"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setConfirming(false);
                }}
                className={`${inputClass} mt-1.5 w-full h-11`}
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Sale date</span>
              <input
                type="date"
                name="sale_date"
                required
                value={saleDate}
                onChange={(e) => {
                  setSaleDate(e.target.value);
                  setConfirming(false);
                }}
                className={`${inputClass} mt-1.5 h-11 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Rate (PKR/kg)</span>
              <input
                inputMode="decimal"
                name="rate"
                required
                placeholder="0.00"
                aria-label="Rate in PKR per kilogram"
                value={rateRaw}
                onChange={(e) => {
                  setRateRaw(e.target.value);
                  setConfirming(false);
                }}
                className={`${inputClass} mt-1.5 h-11 w-full`}
              />
              <span className="mt-1 block text-[11px] text-outline">
                Pre-filled from the cut price list (editable).
              </span>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Reference</span>
              <input
                name="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. job card"
                className={`${inputClass} mt-1.5 h-11 w-full`}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-ink">Notes</span>
              <textarea
                name="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1.5 w-full rounded-lg border border-outline-soft bg-white px-3 py-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-sand bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Output pieces</h2>
            <button
              type="button"
              onClick={addOutput}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-forest px-3 text-xs font-semibold text-forest transition-colors hover:bg-forest-fixed"
            >
              <Plus size={14} weight="bold" />
              Add output
            </button>
          </div>
          <p className="mt-1 text-xs text-secondary">
            Enter the measured results of the cut. Tick the output that is sold to the
            customer — the rest stay in stock.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {outputs.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-[auto_auto_1fr_1fr_auto] items-center gap-2"
              >
                <input
                  type="radio"
                  name="sold_output_radio"
                  aria-label={`Sell output ${index + 1}`}
                  checked={soldIndex === index}
                  onChange={() => {
                    setSoldIndex(index);
                    setConfirming(false);
                  }}
                  className="h-4 w-4 accent-forest"
                />
                <span className="w-6 text-center text-xs font-semibold text-outline">
                  {index + 1}
                </span>
                <input
                  inputMode="decimal"
                  placeholder="Length (ft)"
                  aria-label={`Output ${index + 1} length in feet`}
                  value={row.length_ft}
                  onChange={(e) => updateOutput(index, { length_ft: e.target.value })}
                  className={inputClass}
                />
                <input
                  inputMode="decimal"
                  placeholder="Weight (kg)"
                  aria-label={`Output ${index + 1} weight in kilograms`}
                  value={row.weight_kg}
                  onChange={(e) => updateOutput(index, { weight_kg: e.target.value })}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeOutput(index)}
                  disabled={outputs.length === 1}
                  aria-label={`Remove output ${index + 1}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-outline transition-colors hover:bg-error-soft hover:text-error-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash size={16} />
                </button>
              </div>
            ))}
          </div>

          <label className="mt-4 block max-w-xs text-sm">
            <span className="font-medium text-ink">Scrap produced (kg)</span>
            <input
              inputMode="decimal"
              name="scrap_kg"
              placeholder="0"
              aria-label="Scrap weight in kilograms"
              value={scrapKgRaw}
              onChange={(e) => {
                setScrapKgRaw(e.target.value);
                setConfirming(false);
              }}
              className={`${inputClass} mt-1.5 w-full`}
            />
          </label>
          {scrapKgRaw.trim() !== "" && !scrapValid ? (
            <p role="alert" className="mt-1 text-xs text-error-ink">
              Scrap weight must be a number ≥ 0.
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-6 lg:col-span-2">
        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Reconciliation preview</h2>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-secondary">Source weight</dt>
              <dd className="tabular-nums text-ink">
                {source ? `${formatNumber(source.measured_weight_kg)} kg` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-secondary">Outputs</dt>
              <dd className="tabular-nums text-ink">{formatNumber(totalOutKg)} kg</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-secondary">Scrap</dt>
              <dd className="tabular-nums text-ink">
                {scrapValid ? `${formatNumber(scrapKg)} kg` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-sand pt-2">
              <dt className="font-medium text-ink">Variance</dt>
              <dd
                className={`tabular-nums ${
                  varianceKg !== null && varianceKg !== 0
                    ? varianceKg > 0
                      ? "font-semibold text-error-ink"
                      : "font-semibold text-umber-ink"
                    : "text-ink"
                }`}
              >
                {varianceKg === null ? "—" : `${formatNumber(varianceKg)} kg`}
              </dd>
            </div>
          </dl>

          {rowsValid && scrapValid && source ? (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-outline">
                Sold output
              </h3>
              <div className="mt-2 rounded-lg border border-sand bg-parchment px-3 py-2 text-sm">
                <p className="font-medium text-ink">
                  Output {soldIndex + 1} · {formatNumber(soldWeight)} kg
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  COGS {formatPkr(allocations[soldIndex] ?? 0)} · Invoice amount{" "}
                  <span className="font-semibold text-ink">
                    {soldAmount === null ? "—" : formatPkr(soldAmount)}
                  </span>
                </p>
              </div>
              <p className="mt-2 text-[11px] text-outline">
                Allocation is preview only — the cutting transaction assigns final values.
                Other outputs stay in stock as cut pieces.
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Confirm</h2>
          <p className="mt-1 text-xs text-secondary">
            One transaction: cut the source piece, create the outputs (and scrap lot),
            consume the selected output as a confirmed sale, and post both journals. Cannot
            be undone except by the sale reversal (which restores the sold piece); the cut
            record itself can be reversed separately while every output is still untouched.
          </p>

          {!confirming ? (
            <button
              type="button"
              disabled={!formValid || isPending}
              onClick={() => setConfirming(true)}
              className="mt-3 flex h-11 items-center gap-2 rounded-lg bg-forest px-5 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle size={18} weight="fill" />
              Confirm cut &amp; sale
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-forest/30 bg-forest-fixed/40 p-4">
              <div className="flex items-start gap-2">
                <WarningCircle size={20} className="mt-0.5 shrink-0 text-forest" weight="fill" />
                <div className="text-sm text-ink">
                  <p className="font-semibold">Confirm cut &amp; sale?</p>
                  <p className="mt-1 text-ink-soft">
                    {source?.piece_code} will be split, {outputs.length} piece
                    {outputs.length === 1 ? "" : "s"} will be created, and output{" "}
                    {soldIndex + 1} will be sold for{" "}
                    {soldAmount === null ? "—" : formatPkr(soldAmount)}. The sale posts to
                    Accounts Receivable.
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
                  {isPending ? "Processing…" : "Yes, confirm"}
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
            </div>
          )}
        </div>
      </section>
    </form>
  );
}
