import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import SupplierForm from "@/components/suppliers/supplier-form";
import DeleteSupplierButton from "@/components/suppliers/delete-supplier-button";
import LedgerStatement, {
  type StatementDoc,
  type StatementPayment,
} from "@/components/ledger-statement";
import { getOpenPurchases, getPayments } from "@/server/ledger";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const [supplierResult, openPurchases, paidPayments, balancesResult] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).maybeSingle(),
    getOpenPurchases(supabase),
    getPayments(supabase, "paid"),
    supabase
      .from("supplier_balances")
      .select("outstanding, advance")
      .eq("supplier_id", id)
      .maybeSingle(),
  ]);

  const supplier = supplierResult.data;
  if (!supplier) notFound();

  const docs: StatementDoc[] = openPurchases
    .filter((d) => d.party_id === id)
    .map((d) => ({
      id: d.id,
      number: d.number,
      date: d.date,
      total: d.total,
      allocated: d.allocated,
      outstanding: d.outstanding,
      href: `/purchases/${d.id}`,
    }));

  const payments: StatementPayment[] = paidPayments
    .filter((p) => p.supplier_id === id)
    .map((p) => ({
      id: p.id,
      number: p.payment_number,
      date: p.payment_date,
      amount: p.amount,
      allocated: p.allocated,
      unallocated: p.unallocated,
      status: p.status,
      href: `/payments/${p.id}`,
    }));

  const outstanding = Number(balancesResult.data?.outstanding ?? 0);
  const advance = Number(balancesResult.data?.advance ?? 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/suppliers" className="text-sm text-secondary hover:underline">
        ← Back to suppliers
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">{supplier.name}</h1>

      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <SupplierForm
          values={{
            id: supplier.id,
            name: supplier.name,
            phone: supplier.phone ?? "",
            address: supplier.address ?? "",
            notes: supplier.notes ?? "",
            is_active: supplier.is_active,
          }}
        />
      </div>

      <LedgerStatement
        kind="supplier"
        docs={docs}
        payments={payments}
        outstanding={outstanding}
        advance={advance}
      />

      <section className="mt-6 rounded-xl border border-error/20 bg-white p-6">
        <h2 className="text-base font-semibold text-ink">Danger zone</h2>
        <p className="mt-1 text-sm text-secondary">
          Suppliers with purchase history cannot be deleted. Deactivate instead.
        </p>
        <div className="mt-3">
          <DeleteSupplierButton supplierId={supplier.id} />
        </div>
      </section>
    </div>
  );
}
