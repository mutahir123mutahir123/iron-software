import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import CategoryForm from "@/components/products/category-form";
import DeleteCategoryButton from "@/components/products/delete-category-button";

export default async function CategoriesPage() {
  await connection();
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
      <Link href="/products" className="text-sm text-secondary hover:underline">
        ← Back to products
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Product categories</h1>
      <p className="mt-1 text-sm text-secondary">
        Group specifications such as Saria, Angle, Channel or Pipe. A category in
        use cannot be deleted until its products are reassigned.
      </p>

      <div className="mt-6 rounded-xl border border-sand bg-white p-6">
        <CategoryForm />
      </div>

      <ul className="mt-4 divide-y divide-sand rounded-xl border border-sand bg-white">
        {categories.map((c) => {
          const count = productCount.get(c.id) ?? 0;
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="text-xs text-secondary">
                  {count} {count === 1 ? "product" : "products"}
                </p>
              </div>
              <DeleteCategoryButton categoryId={c.id} />
            </li>
          );
        })}
        {categories.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-secondary">
            No categories yet. Add one above.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
