import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import CustomerForm from "@/components/customers/customer-form";
import DeleteCustomerButton from "@/components/customers/delete-customer-button";
import LedgerStatement, {
  type StatementDoc,
  type StatementPayment,
} from "@/components/ledger-statement";
import { getOpenSales, getPayments } from "@/server/ledger";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const [customerResult, openSales, receivedPayments, balancesResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    getOpenSales(supabase),
    getPayments(supabase, "received"),
    supabase
      .from("customer_balances")
      .select("outstanding, advance")
      .eq("customer_id", id)
      .maybeSingle(),
  ]);

  const customer = customerResult.data;
  if (!customer) notFound();

  const docs: StatementDoc[] = openSales
    .filter((d) => d.party_id === id)
    .map((d) => ({
      id: d.id,
      number: d.number,
      date: d.date,
      total: d.total,
      allocated: d.allocated,
      outstanding: d.outstanding,
      href: `/sales/${d.id}`,
    }));

  const payments: StatementPayment[] = receivedPayments
    .filter((p) => p.customer_id === id)
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

      <LedgerStatement
        kind="customer"
        docs={docs}
        payments={payments}
        outstanding={outstanding}
        advance={advance}
      />

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
