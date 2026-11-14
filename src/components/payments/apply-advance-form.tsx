"use client";

import { useActionState, useState } from "react";
import { formatDate, formatPkr } from "@/lib/format";
import { allocatePayment, type PaymentFormState } from "@/server/actions/payments";
import type { OpenDoc } from "@/server/ledger";

const initialState: PaymentFormState = { error: null };

export default function ApplyAdvanceForm({
  paymentId,
  unallocated,
  openDocs,
  direction,
}: {
  paymentId: string;
  unallocated: number;
  openDocs: OpenDoc[];
  direction: "received" | "paid";
}) {
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [state, formAction, isPending] = useActionState(allocatePayment, initialState);

  const allocations = openDocs
    .filter(
      (doc) => allocationAmounts[doc.id] !== undefined && allocationAmounts[doc.id] !== "",
    )
    .map((doc) => ({ doc, amount: Number(allocationAmounts[doc.id]) }));

  const allocatedSum = allocations.reduce(
    (sum, a) => sum + (Number.isFinite(a.amount) ? a.amount : 0),
    0,
  );
  const invalid = allocations.some(
    (a) =>
      !Number.isFinite(a.amount) || a.amount <= 0 || a.amount > a.doc.outstanding + 0.004,
  );
  const overUnallocated = allocatedSum > unallocated + 0.004;

  const payload = allocations.map((a) =>
    direction === "received"
      ? { sale_id: a.doc.id, amount: a.amount }
      : { purchase_id: a.doc.id, amount: a.amount },
  );

  const docNoun = direction === "received" ? "invoice" : "bill";

  function toggleDoc(doc: OpenDoc) {
    setAllocationAmounts((prev) => {
      const next = { ...prev };
      if (next[doc.id] === undefined) {
        next[doc.id] = Math.min(doc.outstanding, unallocated).toFixed(2);
      } else {
        delete next[doc.id];
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="allocations" value={JSON.stringify(payload)} />

      {openDocs.length === 0 ? (
        <p className="text-sm text-secondary">
          No open {docNoun}s for this party. The advance stays unapplied until one exists.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
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
                        {formatDate(doc.date)} · Outstanding {formatPkr(doc.outstanding)}
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-secondary">
              Applying{" "}
              <span className="font-semibold tabular-nums text-ink">
                {formatPkr(allocatedSum)}
              </span>{" "}
              of{" "}
              <span className="font-semibold tabular-nums text-ink">{formatPkr(unallocated)}</span>{" "}
              unapplied
            </span>
            {overUnallocated ? (
              <span className="font-medium text-error-ink">Exceeds the unapplied balance</span>
            ) : null}
          </div>
        </>
      )}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-sm text-error-ink"
        >
          {state.error}
        </p>
      ) : null}

      {openDocs.length > 0 ? (
        <button
          type="submit"
          disabled={isPending || invalid || overUnallocated || payload.length === 0}
          className="h-11 self-start rounded-lg bg-forest px-5 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Applying…" : "Apply advance"}
        </button>
      ) : null}
    </form>
  );
}
