import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProductForm from "@/components/products/product-form";

export default async function NewProductPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("product_categories")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/products" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Back to products
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Add product</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        A product is a sellable specification. Each physical shaft you receive is
        tracked separately under this specification.
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <ProductForm categories={categories ?? []} />
      </div>
    </div>
  );
}
