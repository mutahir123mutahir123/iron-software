import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import SupplierForm from "@/components/suppliers/supplier-form";
import DeleteSupplierButton from "@/components/suppliers/delete-supplier-button";
import { formatDate } from "@/lib/format";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const [supplierResult, purchasesResult] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("purchases")
      .select("id, purchase_number, purchase_date, status, total_cost")
      .eq("supplier_id", id)
      .order("purchase_date", { ascending: false })
      .limit(10),
  ]);

  const supplier = supplierResult.data;
  if (!supplier) notFound();

  const purchases = purchasesResult.data ?? [];

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

      <section className="mt-6 rounded-xl border border-sand bg-white p-6">
        <h2 className="text-base font-semibold text-ink">Recent purchases</h2>
        {purchases.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">No purchases from this supplier yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/purchases/${p.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {p.purchase_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{formatDate(p.purchase_date)}</td>
                    <td className="py-2 pr-3 text-ink-soft">{p.status}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {Number(p.total_cost).toLocaleString("en-PK", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
