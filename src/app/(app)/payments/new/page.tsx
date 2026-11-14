import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import PaymentForm from "@/components/payments/payment-form";
import { getOpenSales, getOpenPurchases, type OpenDoc } from "@/server/ledger";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; party_id?: string }>;
}) {
  const { direction, party_id } = await searchParams;
  const defaultDirection = direction === "paid" ? "paid" : "received";

  await connection();
  const supabase = await createClient();

  const [
    customersResult,
    suppliersResult,
    openSales,
    openPurchases,
  ] = await Promise.all([
    supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
    getOpenSales(supabase),
    getOpenPurchases(supabase),
  ]);

  const customers = customersResult.data ?? [];
  const suppliers = suppliersResult.data ?? [];

  const salesByParty: Record<string, OpenDoc[]> = {};
  for (const doc of openSales) {
    if (!doc.party_id || doc.outstanding <= 0) continue;
    (salesByParty[doc.party_id] ??= []).push(doc);
  }

  const purchasesByParty: Record<string, OpenDoc[]> = {};
  for (const doc of openPurchases) {
    if (!doc.party_id || doc.outstanding <= 0) continue;
    (purchasesByParty[doc.party_id] ??= []).push(doc);
  }

  const openDocsByParty = { received: salesByParty, paid: purchasesByParty };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/payments" className="text-sm text-secondary hover:underline">
        ← Back to payments
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">New payment</h1>
      <p className="mt-1 text-sm text-secondary">
        Record money received or paid. Allocate it to open documents now, or leave the balance
        unapplied as an advance — it can be applied to future invoices/bills later.
      </p>

      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <PaymentForm
          customers={customers}
          suppliers={suppliers}
          openDocsByParty={openDocsByParty}
          defaultDirection={defaultDirection}
          defaultPartyId={party_id ?? undefined}
        />
      </div>
    </div>
  );
}
