import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PurchaseForm from "@/components/purchases/purchase-form";

export default async function NewPurchasePage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/purchases" className="text-sm text-secondary hover:underline">
        ← Back to purchases
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">New purchase</h1>
      <p className="mt-1 text-sm text-secondary">
        Create a draft, enter each shaft received, then confirm to add stock and post
        the purchase to Accounts Payable.
      </p>

      {(suppliers ?? []).length === 0 ? (
        <div className="mt-6 rounded-xl border border-sand bg-white p-6">
          <p className="text-sm text-ink-soft">
            No active suppliers yet. Add a supplier first.
          </p>
          <Link
            href="/suppliers/new"
            className="mt-3 inline-flex h-11 items-center rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container hover:bg-forest-deep"
          >
            Add supplier
          </Link>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-sand bg-white p-6">
          <PurchaseForm suppliers={suppliers ?? []} />
        </div>
      )}
    </div>
  );
}
