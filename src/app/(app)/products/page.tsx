import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatRate } from "@/lib/format";

type PricingRow = {
  product_id: string;
  full_rate: number;
  cut_rate: number;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; show?: string }>;
}) {
  const { q, category, show } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const showInactive = show === "all";

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [productsResult, categoriesResult, pricingResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, grade, diameter_mm, wall_thickness_mm, standard_length_ft, theoretical_weight_per_ft, is_active, created_at, category_id, product_categories(name)",
      )
      .order("name"),
    supabase.from("product_categories").select("id, name").order("name"),
    supabase
      .from("product_pricing")
      .select("product_id, full_rate, cut_rate, effective_from, effective_to")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
  ]);

  const products = productsResult.data ?? [];
  const categories = categoriesResult.data ?? [];

  const rateByProduct = new Map<string, PricingRow>();
  for (const row of pricingResult.data ?? []) {
    rateByProduct.set(row.product_id, row as PricingRow);
  }

  const filtered = products.filter((p) => {
    if (!showInactive && !p.is_active) return false;
    if (category && p.category_id !== category) return false;
    if (!query) return true;
    const categoryName =
      (p.product_categories as unknown as { name: string } | null)?.name ?? "";
    const haystack = [p.name, p.grade, categoryName].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Products</h1>
          <p className="mt-1 text-sm text-secondary">
            Specifications, categories and effective-dated selling rates.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/products/categories"
            className="rounded-xl border border-outline-soft bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-parchment"
          >
            Categories
          </Link>
          <Link
            href="/products/new"
            className="rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-forest-deep active:scale-[0.98]"
          >
            Add product
          </Link>
        </div>
      </div>

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-sand bg-card p-4 shadow-soft"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-xs font-semibold text-ink-soft">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, grade or category"
            className="h-11 rounded-xl border border-outline-soft bg-cream px-3 text-sm text-ink outline-none transition-shadow placeholder:text-outline focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className="text-xs font-semibold text-ink-soft">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category ?? ""}
            className="h-11 rounded-xl border border-outline-soft bg-cream px-3 text-sm text-ink outline-none focus:border-forest"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="show" className="text-xs font-semibold text-ink-soft">
            Status
          </label>
          <select
            id="show"
            name="show"
            defaultValue={showInactive ? "all" : "active"}
            className="h-11 rounded-xl border border-outline-soft bg-cream px-3 text-sm text-ink outline-none focus:border-forest"
          >
            <option value="active">Active only</option>
            <option value="all">Active + inactive</option>
          </select>
        </div>
        <button
          type="submit"
          className="h-11 rounded-xl border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-parchment"
        >
          Filter
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-sand bg-card shadow-soft">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-parchment text-xs uppercase tracking-wide text-secondary">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Spec</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">kg / ft</th>
              <th className="px-4 py-3 text-right">Rate today (full / cut)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-sand bg-white">
            {filtered.map((p) => {
              const rate = rateByProduct.get(p.id);
              const categoryName =
                (p.product_categories as unknown as { name: string } | null)?.name ?? "—";
              return (
                <tr key={p.id} className="transition-colors hover:bg-parchment/60">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{p.name}</div>
                    <div className="text-xs text-secondary">{p.grade}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {formatNumber(p.diameter_mm)} mm
                    {p.wall_thickness_mm
                      ? ` · ${formatNumber(p.wall_thickness_mm)} mm wall`
                      : ""}{" "}
                    · {formatNumber(p.standard_length_ft)} ft
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{categoryName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                    {formatNumber(p.theoretical_weight_per_ft)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                    {rate ? `${formatRate(rate.full_rate)} / ${formatRate(rate.cut_rate)}` : "Not set"}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_active ? (
                      <span className="rounded-full bg-forest-fixed px-2 py-0.5 text-xs font-semibold text-forest-ink">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-sand px-2 py-0.5 text-xs font-medium text-secondary">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/products/${p.id}`}
                      className="text-sm font-semibold text-forest hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-secondary">
                  No products found.{" "}
                  {products.length === 0
                    ? "Add your first product to get started."
                    : "Adjust the filters."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-secondary">
        {filtered.length} of {products.length} products shown.
      </p>
    </div>
  );
}
