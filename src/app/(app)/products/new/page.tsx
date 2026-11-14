import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import ProductForm from "@/components/products/product-form";

export default async function NewProductPage() {
  await connection();
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/products" className="text-sm text-secondary hover:underline">
        ← Back to products
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Add product</h1>
      <p className="mt-1 text-sm text-secondary">
        A product is a sellable specification. Each physical shaft you receive is
        tracked separately under this specification.
      </p>
      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <ProductForm categories={categories ?? []} />
      </div>
    </div>
  );
}
