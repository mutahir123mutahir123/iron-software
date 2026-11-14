import Link from "next/link";
import SupplierForm from "@/components/suppliers/supplier-form";

export default function NewSupplierPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/suppliers" className="text-sm text-secondary hover:underline">
        ← Back to suppliers
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Add supplier</h1>
      <p className="mt-1 text-sm text-secondary">
        Supplier details are used on purchase documents and in the supplier ledger.
      </p>
      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <SupplierForm />
      </div>
    </div>
  );
}
