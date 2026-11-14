"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CheckCircle,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { createCutting, type CuttingFormState } from "@/server/actions/cutting";
import { formatNumber, formatPkr } from "@/lib/format";

const initialState: CuttingFormState = { error: null };

const inputClass =
  "h-10 rounded-lg border border-outline-soft bg-white px-2 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

export type CuttablePiece = {
  id: string;
  piece_code: string;
  status: string;
  measured_length_ft: number;
  measured_weight_kg: number;
  carrying_value: number;
  product_id?: string;
  products: {
    name: string;
    grade: string;
    diameter_mm: number;
  } | null;
};

type OutputRow = { length_ft: string; weight_kg: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function NewCuttingForm({ pieces }: { pieces: CuttablePiece[] }) {
  const [state, formAction, isPending] = useActionState(createCutting, initialState);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [sourceId, setSourceId] = useState("");
  const [cutDate, setCutDate] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [outputs, setOutputs] = useState<OutputRow[]>([{ length_ft: "", weight_kg: "" }]);
  const [scrapKgRaw, setScrapKgRaw] = useState("");
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
  const totalOutFt = parsedOutputs.reduce(
    (sum, o) => sum + (Number.isFinite(o.length_ft) ? o.length_ft : 0),
    0,
  );
  const scrapKg = scrapKgRaw.trim() === "" ? 0 : Number(scrapKgRaw);
  const scrapValid = Number.isFinite(scrapKg) && scrapKg >= 0;

  // Preview mirrors confirm_cutting(). Display only; the database transaction
  // assigns the authoritative values.
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
      scrapValue =
        scrapKg > 0 ? round2((sourceValue * scrapKg) / (totalOutKg + scrapKg)) : 0;
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

  const formValid = Boolean(source) && rowsValid && scrapValid;
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
    setConfirming(false);
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-5">
      <section className="flex flex-col gap-6 lg:col-span-3">
        <input type="hidden" name="outputs" value={hiddenOutputs} />

        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Source piece</h2>
          <p className="mt-1 text-xs text-secondary">
            Only pieces with status full or cut can be cut. Reserved, split and sold pieces are
            shown in inventory but cannot be selected.
          </p>
          <select
            name="source_piece_id"
            required
            aria-label="Source piece"
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setConfirming(false);
            }}
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

          {source ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-secondary">Weight</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {formatNumber(source.measured_weight_kg)} kg
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-secondary">Length</dt>
                <dd className="mt-0.5 tabular-nums text-ink">
                  {formatNumber(source.measured_length_ft)} ft
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-secondary">Carrying value</dt>
                <dd className="mt-0.5 tabular-nums text-ink">{formatPkr(source.carrying_value)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-secondary">Type</dt>
                <dd className="mt-0.5 text-ink">{source.status === "full" ? "Full shaft" : "Cut piece"}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Cut details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-ink">Cut date</span>
              <input
                type="date"
                name="cut_date"
                required
                value={cutDate}
                onChange={(e) => {
                  setCutDate(e.target.value);
                  setConfirming(false);
                }}
                className={`${inputClass} mt-1.5 w-full`}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Reference</span>
              <input
                name="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. job card"
                className={`${inputClass} mt-1.5 w-full`}
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
            Enter the actual measured length and weight of each piece after cutting. Every piece
            gets its own piece code.
          </p>

          <div className="mt-3 flex flex-col gap-2">
            {outputs.map((row, index) => (
              <div
                key={index}
                className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2"
              >
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
              <dd className="tabular-nums text-ink">
                {formatNumber(totalOutKg)} kg · {formatNumber(totalOutFt)} ft
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-secondary">Scrap</dt>
              <dd className="tabular-nums text-ink">
                {scrapValid ? `${formatNumber(scrapKg)} kg` : "—"}
              </dd>
            </div>
            <div className="flex items-center justify-between border-t border-sand pt-2">
              <dt className="font-medium text-ink">Variance (source − outputs − scrap)</dt>
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

          {varianceKg !== null && varianceKg > 0 ? (
            <p className="mt-2 rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-xs text-error-ink">
              {formatNumber(varianceKg)} kg unexplained — {formatPkr(lossValue)} will be posted to
              Cutting Loss Expense.
            </p>
          ) : null}
          {varianceKg !== null && varianceKg < 0 ? (
            <p className="mt-2 rounded-lg border border-umber/30 bg-umber-fixed px-3 py-2 text-xs text-umber-ink">
              Outputs and scrap exceed the source by {formatNumber(-varianceKg)} kg. The cut is
              allowed and recorded as a negative variance; no cutting loss is posted.
            </p>
          ) : null}

          {source && rowsValid && scrapValid && varianceKg !== null ? (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-outline">
                Allocation of source value {formatPkr(source.carrying_value)}
              </h3>
              <div className="mt-2 overflow-hidden rounded-lg border border-sand">
                <table className="w-full text-left text-xs">
                  <thead className="bg-parchment text-[11px] uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="px-3 py-2">Output</th>
                      <th className="px-3 py-2 text-right">Weight</th>
                      <th className="px-3 py-2 text-right">Allocated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {allocations.map((share, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-ink-soft">Piece {i + 1}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-soft">
                          {formatNumber(parsedOutputs[i]?.weight_kg)} kg
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                          {formatPkr(share)}
                        </td>
                      </tr>
                    ))}
                    {scrapKg > 0 ? (
                      <tr>
                        <td className="px-3 py-1.5 text-ink-soft">Scrap lot</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-soft">
                          {formatNumber(scrapKg)} kg
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                          {formatPkr(scrapValue)}
                        </td>
                      </tr>
                    ) : null}
                    {lossValue > 0 ? (
                      <tr>
                        <td className="px-3 py-1.5 text-ink-soft">Cutting loss</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink-soft">
                          {formatNumber(varianceKg)} kg
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-ink">
                          {formatPkr(lossValue)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-outline">
                Preview only — final values are assigned by the cutting transaction. No revenue or
                profit is created.
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Confirm</h2>
          <p className="mt-1 text-xs text-secondary">
            Confirmation consumes the source piece, creates the output pieces and scrap lot, posts
            the value-transfer journal and writes stock movements. It cannot be undone except by
            a reversal while every output is still untouched.
          </p>

          {!confirming ? (
            <button
              type="button"
              disabled={!formValid || isPending}
              onClick={() => setConfirming(true)}
              className="mt-3 flex h-11 items-center gap-2 rounded-lg bg-forest px-5 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle size={18} weight="fill" />
              Confirm cutting
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-forest/30 bg-forest-fixed/40 p-4">
              <div className="flex items-start gap-2">
                <WarningCircle size={20} className="mt-0.5 shrink-0 text-forest" weight="fill" />
                <div className="text-sm text-ink">
                  <p className="font-semibold">Confirm this cutting?</p>
                  <p className="mt-1 text-ink-soft">
                    {source?.piece_code} will be marked as split and {outputs.length} piece
                    {outputs.length === 1 ? "" : "s"}
                    {scrapKg > 0 ? ` and 1 scrap lot` : ""} will be created. This cannot be undone
                    except by reversal while all outputs remain untouched.
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
                  {isPending ? "Recording…" : "Yes, record cut"}
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
