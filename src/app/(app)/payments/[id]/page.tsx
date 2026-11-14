import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatPkr } from "@/lib/format";
import StatusChip from "@/components/inventory/status-chip";
import ReversePaymentButton from "@/components/payments/reverse-payment-button";
import ApplyAdvanceForm from "@/components/payments/apply-advance-form";
import { getOpenSales, getOpenPurchases, type OpenDoc } from "@/server/ledger";

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("*, customers(name, phone), suppliers(name, phone)")
    .eq("id", id)
    .maybeSingle();

  if (!payment) notFound();

  const isReceived = payment.direction === "received";
  const party = isReceived
    ? (payment.customers as { name: string; phone: string | null } | null)
    : (payment.suppliers as { name: string; phone: string | null } | null);
  const partyId = isReceived ? payment.customer_id : payment.supplier_id;

  const [allocationsResult, journalsResult] = await Promise.all([
    supabase
      .from("payment_allocations")
      .select(
        "id, sale_id, purchase_id, amount, sales(sale_number, total, status), purchases(purchase_number, total_cost, status)",
      )
      .eq("payment_id", payment.id)
      .order("created_at"),
    supabase
      .from("journal_entries")
      .select("id, entry_date, reference_type, description, created_at, journal_lines(debit, credit, accounts(code, name))")
      .eq("reference_id", payment.id)
      .in("reference_type", ["payment", "payment_allocation", "payment_reversal"])
      .order("created_at"),
  ]);

  type AllocationRow = {
    id: string;
    sale_id: string | null;
    purchase_id: string | null;
    amount: number;
    sales: { sale_number: string; total: number; status: string } | null;
    purchases: { purchase_number: string; total_cost: number; status: string } | null;
  };
  const allocations = (allocationsResult.data ?? []) as unknown as AllocationRow[];
  const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
  const unallocated = Math.max(0, Number(payment.amount) - allocatedTotal);

  const journals = (journalsResult.data ?? []).map((entry) => ({
    id: entry.id as string,
    entry_date: entry.entry_date as string,
    reference_type: entry.reference_type as string | null,
    description: entry.description as string | null,
    lines: ((entry.journal_lines ?? []) as unknown as {
      debit: number;
      credit: number;
      accounts: { code: string; name: string } | null;
    }[]).map((line) => ({
      account: line.accounts ? `${line.accounts.code} · ${line.accounts.name}` : "Unknown account",
      debit: Number(line.debit),
      credit: Number(line.credit),
    })),
  }));

  let openDocs: OpenDoc[] = [];
  if (payment.status === "posted" && unallocated > 0 && partyId) {
    if (isReceived) {
      openDocs = (await getOpenSales(supabase)).filter(
        (d) => d.party_id === partyId && d.outstanding > 0,
      );
    } else {
      openDocs = (await getOpenPurchases(supabase)).filter(
        (d) => d.party_id === partyId && d.outstanding > 0,
      );
    }
  }

  const journalTitle: Record<string, string> = {
    payment: isReceived ? "Receipt journal" : "Payment journal",
    payment_allocation: "Advance application journal",
    payment_reversal: "Reversal journal",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/payments" className="text-sm text-secondary hover:underline">
        ← Back to payments
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold text-ink">
              {payment.payment_number}
            </h1>
            <StatusChip status={payment.status} />
          </div>
          <p className="mt-1 text-sm text-secondary">
            {party?.name ?? "Unknown party"}
            {" · "}
            {formatDate(payment.payment_date)}
            {" · "}
            {isReceived ? "Money received" : "Money paid"}
            {" · "}
            {methodLabels[payment.method] ?? payment.method}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="flex flex-col gap-6 lg:col-span-3">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Allocations</h2>
            {allocations.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">
                No allocations — the full amount is an unapplied advance.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="py-2 pr-3">Document</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3 text-right">Doc total</th>
                      <th className="py-2 text-right">Allocated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {allocations.map((a) => {
                      const label = isReceived ? a.sales?.sale_number : a.purchases?.purchase_number;
                      const total = isReceived ? a.sales?.total : a.purchases?.total_cost;
                      const href = isReceived ? `/sales/${a.sale_id}` : `/purchases/${a.purchase_id}`;
                      return (
                        <tr key={a.id}>
                          <td className="py-2 pr-3">
                            <Link href={href} className="font-medium text-forest hover:underline">
                              {label ?? "Unknown document"}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-ink-soft">
                            {isReceived ? "Invoice" : "Bill"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                            {total !== undefined ? formatPkr(total) : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums text-ink">
                            {formatPkr(a.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-sand pt-3 text-sm">
              <span className="text-secondary">
                Allocated {formatPkr(allocatedTotal)} of {formatPkr(payment.amount)}
              </span>
              {payment.status === "reversed" ? (
                <span className="font-medium text-error-ink">Reversed — allocations ignored</span>
              ) : (
                <span
                  className={`tabular-nums font-medium ${
                    unallocated > 0 ? "text-umber-ink" : "text-forest-ink"
                  }`}
                >
                  {unallocated > 0
                    ? `Unapplied advance: ${formatPkr(unallocated)}`
                    : "Fully allocated"}
                </span>
              )}
            </div>
          </div>

          {payment.status === "posted" && unallocated > 0 ? (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Apply advance</h2>
              <p className="mt-1 text-xs text-secondary">
                Apply part or all of the unapplied balance to open{" "}
                {isReceived ? "invoices" : "bills"} for this{" "}
                {isReceived ? "customer" : "supplier"}. Cash is not moved — this only reclassifies
                the advance in the ledger.
              </p>
              <div className="mt-3">
                <ApplyAdvanceForm
                  paymentId={payment.id}
                  unallocated={unallocated}
                  openDocs={openDocs}
                  direction={payment.direction}
                />
              </div>
            </div>
          ) : null}

          {journals.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-sand bg-white p-6"
            >
              <h2 className="text-base font-semibold text-ink">
                {journalTitle[entry.reference_type ?? ""] ?? "Journal entry"}
              </h2>
              <p className="mt-0.5 text-xs text-secondary">
                {entry.description} · {formatDate(entry.entry_date)}
              </p>
              <table className="mt-3 w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3 text-right">Debit</th>
                    <th className="py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand">
                  {entry.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-ink">{line.account}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {line.debit > 0 ? formatPkr(line.debit) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-soft">
                        {line.credit > 0 ? formatPkr(line.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-6 lg:col-span-2">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Payment details</h2>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Direction</dt>
                <dd className="text-ink">{isReceived ? "Money received" : "Money paid"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-secondary">{isReceived ? "From customer" : "To supplier"}</dt>
                <dd className="text-right text-ink">{party?.name}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Date</dt>
                <dd className="text-ink">{formatDate(payment.payment_date)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Method</dt>
                <dd className="text-ink">{methodLabels[payment.method] ?? payment.method}</dd>
              </div>
              {payment.reference ? (
                <div className="flex items-center justify-between">
                  <dt className="text-secondary">Reference</dt>
                  <dd className="text-ink">{payment.reference}</dd>
                </div>
              ) : null}
              {payment.notes ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-secondary">Notes</dt>
                  <dd className="text-right text-ink">{payment.notes}</dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-sand pt-3">
                <dt className="font-semibold text-ink">Total amount</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {formatPkr(payment.amount)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 rounded-lg bg-parchment px-4 py-3 text-xs text-ink-soft">
              {isReceived
                ? "Journal: DR Cash/Bank · CR Accounts Receivable (allocated) · CR Customer Advances (unapplied)."
                : "Journal: CR Cash/Bank · DR Accounts Payable (allocated) · DR Supplier Advances (unapplied)."}
            </div>
          </div>

          {payment.status === "posted" ? (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Reversal</h2>
              <p className="mt-1 text-xs text-secondary">
                A reversal posts compensating journal entries for this payment and all of its
                allocations. The original records are kept for history.
              </p>
              <div className="mt-3">
                <ReversePaymentButton
                  paymentId={payment.id}
                  paymentNumber={payment.payment_number}
                  allocationCount={allocations.length}
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
