"use client";

import { useActionState, useMemo, useState } from "react";
import { formatDate, formatPkr } from "@/lib/format";
import { createPayment, type PaymentFormState } from "@/server/actions/payments";
import type { OpenDoc } from "@/server/ledger";

const initialState: PaymentFormState = { error: null };

const methods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
];

type Direction = "received" | "paid";

export default function PaymentForm({
  customers,
  suppliers,
  openDocsByParty,
  defaultDirection,
  defaultPartyId,
}: {
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  openDocsByParty: Record<Direction, Record<string, OpenDoc[]>>;
  defaultDirection?: Direction;
  defaultPartyId?: string;
}) {
  const [direction, setDirection] = useState<Direction>(defaultDirection ?? "received");
  const [partyId, setPartyId] = useState(defaultPartyId ?? "");
  const [amount, setAmount] = useState("");
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [state, formAction, isPending] = useActionState(createPayment, initialState);

  const parties = direction === "received" ? customers : suppliers;
  const partyLabel = direction === "received" ? "Customer" : "Supplier";
  const openDocs = useMemo(
    () => openDocsByParty[direction][partyId] ?? [],
    [openDocsByParty, direction, partyId],
  );

  const allocations = openDocs
    .filter((doc) => allocationAmounts[doc.id] !== undefined && allocationAmounts[doc.id] !== "")
    .map((doc) => ({ doc, amount: Number(allocationAmounts[doc.id]) }));

  const allocatedSum = allocations.reduce(
    (sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0),
    0,
  );
  const amountValue = Number(amount);
  const remainder = Number.isFinite(amountValue) ? amountValue - allocatedSum : 0;
  const overAllocated = Number.isFinite(amountValue) && allocatedSum > amountValue + 0.004;
  const invalidAllocation = allocations.some(
    (a) =>
      !Number.isFinite(a.amount) || a.amount <= 0 || a.amount > a.doc.outstanding + 0.004,
  );

  const allocationsPayload = allocations.map((a) =>
    direction === "received"
      ? { sale_id: a.doc.id, amount: a.amount }
      : { purchase_id: a.doc.id, amount: a.amount },
  );

  function switchDirection(next: Direction) {
    setDirection(next);
    setPartyId("");
    setAllocationAmounts({});
  }

  function switchParty(next: string) {
    setPartyId(next);
    setAllocationAmounts({});
  }

  function toggleDoc(doc: OpenDoc) {
    setAllocationAmounts((prev) => {
      const next = { ...prev };
      if (next[doc.id] === undefined) {
        next[doc.id] = doc.outstanding.toFixed(2);
      } else {
        delete next[doc.id];
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="direction" value={direction} />
      <input
        type="hidden"
        name="allocations"
        value={JSON.stringify(allocationsPayload)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <span className="text-sm font-medium text-ink">Direction</span>
          <div className="mt-1.5 flex rounded-lg border border-outline-soft bg-white p-1">
            {(
              [
                { value: "received", label: "Money received (from customer)" },
                { value: "paid", label: "Money paid (to supplier)" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={direction === option.value}
                onClick={() => switchDirection(option.value)}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  direction === option.value
                    ? "bg-forest text-forest-on-container"
                    : "text-ink-soft hover:bg-sand"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="party_id" className="text-sm font-medium text-ink">
            {partyLabel}
          </label>
          <select
            id="party_id"
            name="party_id"
            required
            value={partyId}
            onChange={(e) => switchParty(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          >
            <option value="">Select {partyLabel.toLowerCase()}…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="payment_date" className="text-sm font-medium text-ink">
            Date
          </label>
          <input
            id="payment_date"
            name="payment_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div>
          <label htmlFor="amount" className="text-sm font-medium text-ink">
            Amount (PKR)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="0.01"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm tabular-nums text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div>
          <label htmlFor="method" className="text-sm font-medium text-ink">
            Method
          </label>
          <select
            id="method"
            name="method"
            required
            defaultValue="cash"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          >
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reference" className="text-sm font-medium text-ink">
            Reference <span className="font-normal text-outline">(optional)</span>
          </label>
          <input
            id="reference"
            name="reference"
            placeholder="Cheque no. / transfer ref…"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className="text-sm font-medium text-ink">
            Notes <span className="font-normal text-outline">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            placeholder="Any note for the record…"
            className="mt-1.5 h-11 w-full rounded-lg border border-outline-soft bg-white px-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
      </div>

      <div className="rounded-xl border border-sand bg-parchment p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Allocate to open {direction === "received" ? "invoices" : "bills"}
          </h3>
          <p className="text-xs text-secondary">
            {partyId
              ? `${openDocs.length} open ${direction === "received" ? "invoice" : "bill"}${openDocs.length === 1 ? "" : "s"}`
              : `Select a ${partyLabel.toLowerCase()} first`}
          </p>
        </div>

        {partyId && openDocs.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">
            No open {direction === "received" ? "invoices" : "bills"} for this{" "}
            {partyLabel.toLowerCase()}. The full amount will be recorded as an advance.
          </p>
        ) : null}

        {openDocs.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {openDocs.map((doc) => {
              const checked = allocationAmounts[doc.id] !== undefined;
              return (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-sand bg-white p-3"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDoc(doc)}
                      className="h-4 w-4 accent-forest"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{doc.number}</span>
                      <span className="block text-xs text-secondary">
                        {formatDate(doc.date)} · Total {formatPkr(doc.total)} · Outstanding{" "}
                        {formatPkr(doc.outstanding)}
                      </span>
                    </span>
                  </label>
                  {checked ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Amount to allocate to ${doc.number}`}
                      value={allocationAmounts[doc.id]}
                      onChange={(e) =>
                        setAllocationAmounts((prev) => ({ ...prev, [doc.id]: e.target.value }))
                      }
                      className="h-10 w-32 rounded-lg border border-outline-soft bg-white px-3 text-right text-sm tabular-nums text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sand pt-3 text-sm">
          <span className="text-secondary">
            Allocating{" "}
            <span className="font-semibold tabular-nums text-ink">
              {formatPkr(allocatedSum)}
            </span>{" "}
            of{" "}
            <span className="font-semibold tabular-nums text-ink">
              {formatPkr(Number.isFinite(amountValue) ? amountValue : 0)}
            </span>
          </span>
          <span
            className={`tabular-nums font-medium ${
              remainder < -0.004
                ? "text-error-ink"
                : remainder > 0.004
                  ? "text-umber-ink"
                  : "text-forest-ink"
            }`}
          >
            {remainder < -0.004
              ? `Over-allocated by ${formatPkr(-remainder)}`
              : remainder > 0.004
                ? `Unapplied advance: ${formatPkr(remainder)}`
                : "Fully allocated"}
          </span>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-4 py-3 text-sm text-error-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || overAllocated || invalidAllocation}
          className="flex h-12 items-center gap-2 rounded-lg bg-forest px-6 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Recording…" : "Record payment"}
        </button>
        <p className="text-xs text-outline">
          Unapplied amounts stay as advances — they are never forced onto a document.
        </p>
      </div>
    </form>
  );
}

