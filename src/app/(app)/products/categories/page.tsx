import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CategoryForm from "@/components/products/category-form";
import DeleteCategoryButton from "@/components/products/delete-category-button";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const [categoriesResult, productsResult] = await Promise.all([
    supabase.from("product_categories").select("id, name, created_at").order("name"),
    supabase.from("products").select("category_id"),
  ]);

  const categories = categoriesResult.data ?? [];
  const productCount = new Map<string, number>();
  for (const p of productsResult.data ?? []) {
    if (p.category_id) {
      productCount.set(p.category_id, (productCount.get(p.category_id) ?? 0) + 1);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/products" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Back to products
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Product categories</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Group specifications such as Saria, Angle, Channel or Pipe. A category in
        use cannot be deleted until its products are reassigned.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <CategoryForm />
      </div>

      <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {categories.map((c) => {
          const count = productCount.get(c.id) ?? 0;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {count} {count === 1 ? "product" : "products"}
                </p>
              </div>
              <DeleteCategoryButton categoryId={c.id} />
            </li>
          );
        })}
        {categories.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No categories yet. Add one above.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
