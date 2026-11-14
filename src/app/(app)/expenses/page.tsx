import Link from "next/link";
import {
  Receipt,
  CurrencyCircleDollar,
  ArrowCounterClockwise,
  CreditCard,
  Plus,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatPkr } from "@/lib/format";
import StatCard from "@/components/inventory/stat-card";
import StatusChip from "@/components/inventory/status-chip";
import PaymentsTabs from "@/components/payments/payments-tabs";
import ReverseExpenseButton from "@/components/expenses/reverse-expense-button";
import CategoryForm from "@/components/expenses/category-form";
import DeleteCategoryButton from "@/components/expenses/delete-category-button";

const PAGE_SIZE = 15;

const statusFilters = [
  { value: "", label: "All" },
  { value: "posted", label: "Posted" },
  { value: "reversed", label: "Reversed" },
];

const methodLabels: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  credit: "On account",
};

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number;
  payee: string | null;
  method: string;
  reference: string | null;
  status: string;
  expense_categories: { name: string; account_id: string | null; accounts: { code: string } | null } | null;
};

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const statusFilter = statusFilters.some((s) => s.value === status) ? (status ?? "") : "";
  const currentPage = Math.max(1, Number(page) || 1);

  await connection();
  const supabase = await createClient();

  const [expensesResult, categoriesResult] = await Promise.all([
    supabase
      .from("expenses")
      .select(
        "id, expense_date, amount, payee, method, reference, status, expense_categories(name, account_id, accounts(code))",
      )
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("expense_categories")
      .select("id, name, account_id, accounts(code)")
      .order("name"),
  ]);

  const expenses = (expensesResult.data ?? []) as unknown as ExpenseRow[];
  const categories = (categoriesResult.data ?? []) as unknown as {
    id: string;
    name: string;
    account_id: string | null;
    accounts: { code: string } | null;
  }[];

  const posted = expenses.filter((e) => e.status === "posted");
  const postedTotal = posted.reduce((sum, e) => sum + Number(e.amount), 0);
  const creditTotal = posted
    .filter((e) => e.method === "credit")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const reversedCount = expenses.length - posted.length;

  const filtered = expenses.filter((e) => {
    if (statusFilter && e.status !== statusFilter) return false;
    if (!query) return true;
    const haystack = [
      e.expense_categories?.name ?? "",
      e.payee ?? "",
      e.reference ?? "",
      methodLabels[e.method] ?? e.method,
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
    return s ? `/expenses?${s}` : "/expenses";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Payments &amp; Expenses</h1>
          <p className="mt-1 text-sm text-secondary">
            Operating expenses — paid ones hit cash/bank, unpaid ones sit in Accounts Payable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PaymentsTabs active="expenses" />
          <Link
            href="/expenses/new"
            className="flex h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
          >
            <Plus size={18} weight="bold" />
            New expense
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Posted expenses"
          value={String(posted.length)}
          icon={<Receipt size={20} />}
        />
        <StatCard
          label="Posted total"
          value={formatPkr(postedTotal)}
          icon={<CurrencyCircleDollar size={20} />}
        />
        <StatCard
          label="On account (unpaid)"
          value={formatPkr(creditTotal)}
          icon={<CreditCard size={20} />}
          tone={creditTotal > 0 ? "alert" : "default"}
        />
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/expenses">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search category, payee or reference…"
            aria-label="Search expenses"
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
              ? "No expenses match your filters."
              : "No expenses yet. Record your first expense."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Payee</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {pageRows.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3 text-ink-soft">{formatDate(e.expense_date)}</td>
                    <td className="px-6 py-3 text-ink">
                      {e.expense_categories?.name ?? "—"}
                      {e.expense_categories?.accounts?.code ? (
                        <span className="block text-xs text-outline">
                          posts to {e.expense_categories.accounts.code}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{e.payee ?? "—"}</td>
                    <td className="px-6 py-3 text-ink-soft">
                      {methodLabels[e.method] ?? e.method}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink">
                      {formatPkr(e.amount)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusChip status={e.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      {e.status === "posted" ? (
                        <ReverseExpenseButton
                          expenseId={e.id}
                          amountLabel={formatPkr(e.amount)}
                        />
                      ) : null}
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
            Page {safePage} of {totalPages} · {filtered.length} expense
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Expense categories</h2>
          <p className="mt-1 text-xs text-secondary">
            Which expense account each category posts to. Categories without a mapping post to
            6190 Miscellaneous.
          </p>
          <ul className="mt-4 divide-y divide-sand">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-ink">
                  {c.name}
                  <span className="ml-2 text-xs tabular-nums text-outline">
                    {c.accounts?.code ?? "6190"}
                  </span>
                </span>
                <DeleteCategoryButton categoryId={c.id} categoryName={c.name} />
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-sand bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Add category</h2>
          <div className="mt-4">
            <CategoryForm />
          </div>
          <p className="mt-4 text-xs text-outline">
            Confirmed expenses are corrected by reversing them, never by editing or deleting.
            {reversedCount > 0 ? ` ${reversedCount} reversed expense${reversedCount === 1 ? "" : "s"} kept for history.` : ""}
          </p>
        </div>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-outline">
        <ArrowCounterClockwise size={14} />
        Journals post automatically: paid → DR expense / CR cash or bank · unpaid (on account) → DR
        expense / CR Accounts Payable.
      </p>
    </div>
  );
}
