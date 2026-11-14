import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, PiggyBank } from "@phosphor-icons/react/dist/ssr";
import { formatDate, formatPkr } from "@/lib/format";
import StatusChip from "@/components/inventory/status-chip";

export type StatementDoc = {
  id: string;
  number: string;
  date: string;
  total: number;
  allocated: number;
  outstanding: number;
  href: string;
};

export type StatementPayment = {
  id: string;
  number: string;
  date: string;
  amount: number;
  allocated: number;
  unallocated: number;
  status: string;
  href: string;
};

export default function LedgerStatement({
  kind,
  docs,
  payments,
  outstanding,
  advance,
}: {
  kind: "customer" | "supplier";
  docs: StatementDoc[];
  payments: StatementPayment[];
  outstanding: number;
  advance: number;
}) {
  const isCustomer = kind === "customer";
  const docLabel = isCustomer ? "Invoice" : "Bill";
  const paymentLabel = isCustomer ? "Receipt" : "Payment";
  const outstandingLabel = isCustomer ? "Receivable outstanding" : "Payable outstanding";
  const advanceLabel = isCustomer ? "Customer advance on account" : "Supplier advance on account";

  return (
    <section className="mt-6 rounded-xl border border-sand bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">
          Statement of account
        </h2>
        <Link
          href={`/payments/new?direction=${isCustomer ? "received" : "paid"}`}
          className="flex h-10 items-center gap-2 rounded-lg border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sand hover:text-ink"
        >
          {isCustomer ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
          Record {isCustomer ? "receipt" : "payment"}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-parchment px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
            {isCustomer ? (
              <ArrowDownLeft size={13} />
            ) : (
              <ArrowUpRight size={13} />
            )}
            {outstandingLabel}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {formatPkr(outstanding)}
          </p>
        </div>
        <div className="rounded-lg bg-parchment px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
            <PiggyBank size={13} />
            {advanceLabel}
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
            {formatPkr(advance)}
          </p>
        </div>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-secondary">
        {isCustomer ? "Invoices" : "Bills"}
      </h3>
      {docs.length === 0 ? (
        <p className="mt-2 text-sm text-secondary">
          No confirmed {isCustomer ? "invoices" : "bills"} yet.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-secondary">
              <tr>
                <th className="py-2 pr-3">{docLabel}</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 pr-3 text-right">Paid</th>
                <th className="py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td className="py-2 pr-3">
                    <Link href={doc.href} className="font-medium text-forest hover:underline">
                      {doc.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-ink-soft">{formatDate(doc.date)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                    {formatPkr(doc.total)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                    {formatPkr(doc.allocated)}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${
                      doc.outstanding > 0 ? "font-medium text-ink" : "text-forest-ink"
                    }`}
                  >
                    {formatPkr(doc.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-secondary">
        {isCustomer ? "Receipts" : "Payments"}
      </h3>
      {payments.length === 0 ? (
        <p className="mt-2 text-sm text-secondary">
          No {isCustomer ? "receipts" : "payments"} yet.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-secondary">
              <tr>
                <th className="py-2 pr-3">{paymentLabel}</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 text-right">Unapplied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3">
                    <Link href={p.href} className="font-medium text-forest hover:underline">
                      {p.number}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-ink-soft">{formatDate(p.date)}</td>
                  <td className="py-2 pr-3">
                    <StatusChip status={p.status} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                    {formatPkr(p.amount)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">
                    {formatPkr(p.unallocated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-outline">
        Balances are derived from posted documents and the allocation ledger. Reversed documents
        and payments are excluded automatically.
      </p>
    </section>
  );
}
