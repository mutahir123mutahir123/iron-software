import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import ExpenseForm from "@/components/expenses/expense-form";

export default async function NewExpensePage() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_categories")
    .select("id, name")
    .order("name");

  const categories = data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/expenses" className="text-sm text-secondary hover:underline">
        ← Back to expenses
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">New expense</h1>
      <p className="mt-1 text-sm text-secondary">
        Choose &ldquo;on account&rdquo; for unpaid expenses — they post to Accounts Payable and are
        marked paid when you record a supplier payment.
      </p>

      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        {categories.length === 0 ? (
          <p className="text-sm text-secondary">
            No expense categories yet — add one from the expenses page first.
          </p>
        ) : (
          <ExpenseForm categories={categories} />
        )}
      </div>
    </div>
  );
}
