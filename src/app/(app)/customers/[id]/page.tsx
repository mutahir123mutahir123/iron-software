import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import CustomerForm from "@/components/customers/customer-form";
import DeleteCustomerButton from "@/components/customers/delete-customer-button";
import { formatDate, formatPkr } from "@/lib/format";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const [customerResult, salesResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("sales")
      .select("id, sale_number, sale_date, status, total")
      .eq("customer_id", id)
      .order("sale_date", { ascending: false })
      .limit(10),
  ]);

  const customer = customerResult.data;
  if (!customer) notFound();

  const sales = salesResult.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/customers" className="text-sm text-secondary hover:underline">
        ← Back to customers
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">{customer.name}</h1>

      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <CustomerForm
          values={{
            id: customer.id,
            name: customer.name,
            phone: customer.phone ?? "",
            address: customer.address ?? "",
            notes: customer.notes ?? "",
            is_active: customer.is_active,
          }}
        />
      </div>

      <section className="mt-6 rounded-xl border border-sand bg-white p-6">
        <h2 className="text-base font-semibold text-ink">Recent sales</h2>
        {sales.length === 0 ? (
          <p className="mt-3 text-sm text-secondary">No sales for this customer yet.</p>
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
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/sales/${s.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {s.sale_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">{formatDate(s.sale_date)}</td>
                    <td className="py-2 pr-3 text-ink-soft">{s.status}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                      {formatPkr(s.total)}
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
          Customers with sale history cannot be deleted. Deactivate instead.
        </p>
        <div className="mt-3">
          <DeleteCustomerButton customerId={customer.id} />
        </div>
      </section>
    </div>
  );
}
