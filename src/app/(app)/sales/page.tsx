import Link from "next/link";
import {
  Receipt,
  Plus,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CurrencyCircleDollar,
  CircleDashed,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatPkr } from "@/lib/format";
import StatCard from "@/components/inventory/stat-card";
import StatusChip from "@/components/inventory/status-chip";

const PAGE_SIZE = 15;

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
};

const statusFilters = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "reversed", label: "Reversed" },
];

type SaleRow = {
  id: string;
  sale_number: string;
  sale_date: string;
  sale_type: string;
  status: string;
  total: number;
  customers: { name: string } | null;
};

const typeLabels: Record<string, string> = {
  full: "Full",
  cut: "Cut",
  scrap: "Scrap",
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, status, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const statusFilter = statusFilters.some((s) => s.value === status) ? (status ?? "") : "";
  const currentPage = Math.max(1, Number(page) || 1);

  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, sale_type, status, total, customers(name)",
    )
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false });

  const sales = (data ?? []) as unknown as SaleRow[];

  const confirmed = sales.filter((s) => s.status === "confirmed");
  const confirmedValue = confirmed.reduce((sum, s) => sum + Number(s.total), 0);

  const filtered = sales.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (!query) return true;
    const haystack = [
      s.sale_number,
      s.customers?.name ?? "",
      typeLabels[s.sale_type] ?? s.sale_type,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const draftCount = sales.filter((s) => s.status === "draft").length;

  function buildQuery(params: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    const s = search.toString();
    return s ? `/sales?${s}` : "/sales";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Sales &amp; Invoices</h1>
          <p className="mt-1 text-sm text-secondary">
            Full-shaft, cut-piece and scrap sales; invoice history and reversals.
          </p>
        </div>
        <Link
          href="/sales/new"
          className="flex h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
        >
          <Plus size={18} weight="bold" />
          New sale
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Confirmed sales"
          value={String(confirmed.length)}
          icon={<CheckCircle size={20} />}
        />
        <StatCard
          label="Confirmed sales value"
          value={formatPkr(confirmedValue)}
          icon={<CurrencyCircleDollar size={20} />}
        />
        <StatCard
          label="Drafts awaiting confirmation"
          value={String(draftCount)}
          icon={<CircleDashed size={20} />}
          tone={draftCount > 0 ? "alert" : "default"}
        />
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/sales">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search number, customer or type…"
            aria-label="Search sales"
            className="h-11 w-full rounded-lg border border-outline-soft bg-white pl-10 pr-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <div className="flex rounded-lg border border-outline-soft bg-white p-1">
          {statusFilters.map((s) => (
            <Link
              key={s.value}
              href={buildQuery({ q, status: s.value || undefined })}
              aria-pressed={statusFilter === s.value}
              className={`rounded-md px-3 text-sm font-medium leading-9 transition-colors ${
                statusFilter === s.value
                  ? "bg-forest text-forest-on-container"
                  : "text-ink-soft hover:bg-sand"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {pageRows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {query || statusFilter
              ? "No sales match your filters."
              : "No sales yet. Create a draft invoice to sell your first piece."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Number</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {pageRows.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3">
                      <Link
                        href={`/sales/${s.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {s.sale_number}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{formatDate(s.sale_date)}</td>
                    <td className="px-6 py-3 text-ink-soft">{s.customers?.name ?? "—"}</td>
                    <td className="px-6 py-3 text-ink-soft">
                      {typeLabels[s.sale_type] ?? s.sale_type}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink">
                      {formatPkr(s.total)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusChip status={s.status} />
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
            Page {safePage} of {totalPages} · {filtered.length} sale
            {filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={buildQuery({ q, status: statusFilter || undefined, page: String(safePage - 1) })}
              aria-label="Previous page"
              aria-disabled={safePage <= 1}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border border-outline-soft text-ink-soft ${
                safePage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-sand"
              }`}
            >
              <CaretLeft size={18} />
            </Link>
            <Link
              href={buildQuery({ q, status: statusFilter || undefined, page: String(safePage + 1) })}
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
        <Receipt size={14} />
        Confirmed sales post to Accounts Receivable. Customer payments are recorded in Payments
        &amp; Expenses.
      </p>
    </div>
  );
}
