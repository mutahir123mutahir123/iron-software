import Link from "next/link";
import CustomerForm from "@/components/customers/customer-form";

export default function NewCustomerPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/customers" className="text-sm text-secondary hover:underline">
        ← Back to customers
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Add customer</h1>
      <p className="mt-1 text-sm text-secondary">
        Customer details are used on sale invoices and in the customer ledger.
      </p>
      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <CustomerForm />
      </div>
    </div>
  );
}
