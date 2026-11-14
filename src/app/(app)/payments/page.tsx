import Link from "next/link";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  PiggyBank,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  Plus,
} from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatPkr } from "@/lib/format";
import StatCard from "@/components/inventory/stat-card";
import StatusChip from "@/components/inventory/status-chip";
import PaymentsTabs from "@/components/payments/payments-tabs";
import { getPayments } from "@/server/ledger";

const PAGE_SIZE = 15;

const directionFilters = [
  { value: "", label: "All" },
  { value: "received", label: "Received" },
  { value: "paid", label: "Paid" },
];

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; direction?: string; page?: string }>;
}) {
  const { q, direction, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const directionFilter = directionFilters.some((d) => d.value === direction)
    ? (direction ?? "")
    : "";
  const currentPage = Math.max(1, Number(page) || 1);

  await connection();
  const supabase = await createClient();

  const [received, paid, customersResult, suppliersResult] = await Promise.all([
    getPayments(supabase, "received"),
    getPayments(supabase, "paid"),
    supabase.from("customers").select("id, name"),
    supabase.from("suppliers").select("id, name"),
  ]);

  const customerNames = new Map(
    (customersResult.data ?? []).map((c) => [c.id as string, c.name as string]),
  );
  const supplierNames = new Map(
    (suppliersResult.data ?? []).map((s) => [s.id as string, s.name as string]),
  );

  const all = [...received, ...paid].sort((a, b) => {
    if (a.payment_date !== b.payment_date) {
      return a.payment_date < b.payment_date ? 1 : -1;
    }
    return a.payment_number < b.payment_number ? 1 : -1;
  });

  const posted = all.filter((p) => p.status === "posted");
  const receivedTotal = posted
    .filter((p) => p.party_type === "customer")
    .reduce((sum, p) => sum + p.amount, 0);
  const paidTotal = posted
    .filter((p) => p.party_type === "supplier")
    .reduce((sum, p) => sum + p.amount, 0);
  const unappliedTotal = posted.reduce((sum, p) => sum + p.unallocated, 0);

  const partyName = (p: (typeof all)[number]) =>
    p.party_type === "customer"
      ? (customerNames.get(p.customer_id ?? "") ?? "Unknown customer")
      : (supplierNames.get(p.supplier_id ?? "") ?? "Unknown supplier");

  const filtered = all.filter((p) => {
    if (directionFilter && p.party_type !== (directionFilter === "received" ? "customer" : "supplier")) {
      return false;
    }
    if (!query) return true;
    const haystack = [
      p.payment_number,
      partyName(p),
      methodLabels[p.method] ?? p.method,
      p.status,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function buildQuery(params: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    const s = search.toString();
    return s ? `/payments?${s}` : "/payments";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Payments &amp; Expenses</h1>
          <p className="mt-1 text-sm text-secondary">
            Receipts, supplier payments, allocations and unapplied advances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PaymentsTabs active="payments" />
          <Link
            href="/payments/new"
            className="flex h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
          >
            <Plus size={18} weight="bold" />
            New payment
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Received (posted)"
          value={formatPkr(receivedTotal)}
          icon={<ArrowDownLeft size={20} />}
        />
        <StatCard
          label="Paid (posted)"
          value={formatPkr(paidTotal)}
          icon={<ArrowUpRight size={20} />}
        />
        <StatCard
          label="Unapplied advances"
          value={formatPkr(unappliedTotal)}
          icon={<PiggyBank size={20} />}
          tone={unappliedTotal > 0 ? "alert" : "default"}
        />
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/payments">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search number, party or method…"
            aria-label="Search payments"
            className="h-11 w-full rounded-lg border border-outline-soft bg-white pl-10 pr-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <div className="flex rounded-lg border border-outline-soft bg-white p-1">
          {directionFilters.map((d) => (
            <Link
              key={d.value}
              href={buildQuery({ q, direction: d.value || undefined })}
              aria-pressed={directionFilter === d.value}
              className={`rounded-md px-3 text-sm font-medium leading-9 transition-colors ${
                directionFilter === d.value
                  ? "bg-forest text-forest-on-container"
                  : "text-ink-soft hover:bg-sand"
              }`}
            >
              {d.label}
            </Link>
          ))}
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {pageRows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {query || directionFilter
              ? "No payments match your filters."
              : "No payments yet. Record your first receipt or supplier payment."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Number</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Party</th>
                  <th className="px-6 py-3">Direction</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3 text-right">Unapplied</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {pageRows.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3">
                      <Link
                        href={`/payments/${p.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {p.payment_number}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{formatDate(p.payment_date)}</td>
                    <td className="px-6 py-3 text-ink-soft">{partyName(p)}</td>
                    <td className="px-6 py-3 text-ink-soft">
                      {p.party_type === "customer" ? "Received" : "Paid"}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">
                      {methodLabels[p.method] ?? p.method}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink">
                      {formatPkr(p.amount)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                      {formatPkr(p.unallocated)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusChip status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-secondary">
            Page {safePage} of {totalPages} · {filtered.length} payment
            {filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={buildQuery({ q, direction: directionFilter || undefined, page: String(safePage - 1) })}
              aria-label="Previous page"
              aria-disabled={safePage <= 1}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border border-outline-soft text-ink-soft ${
                safePage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-sand"
              }`}
            >
              <CaretLeft size={18} />
            </Link>
            <Link
              href={buildQuery({ q, direction: directionFilter || undefined, page: String(safePage + 1) })}
              aria-label="Next page"
              aria-disabled={safePage >= totalPages}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border border-outline-soft text-ink-soft ${
                safePage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-sand"
              }`}
            >
              <CaretRight size={18} />
            </Link>
          </div>
        </div>
      ) : null}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-outline">
        <Wallet size={14} />
        Outstanding balances are derived from posted documents and allocations — they are never
        entered or edited by hand.
      </p>
    </div>
  );
}
