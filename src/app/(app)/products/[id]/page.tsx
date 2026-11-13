import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProductForm from "@/components/products/product-form";
import PricingForm from "@/components/products/pricing-form";
import DeletePricingButton from "@/components/products/delete-pricing-button";
import { formatNumber, formatRate } from "@/lib/format";

type PricingRow = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  full_rate: number;
  cut_rate: number;
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [productResult, categoriesResult, pricingResult] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_categories").select("id, name").order("name"),
    supabase
      .from("product_pricing")
      .select("id, effective_from, effective_to, full_rate, cut_rate")
      .eq("product_id", id)
      .order("effective_from", { ascending: false }),
  ]);

  const product = productResult.data;
  if (!product) notFound();

  const categories = categoriesResult.data ?? [];
  const pricing = (pricingResult.data ?? []) as PricingRow[];

  const today = new Date().toISOString().slice(0, 10);
  const currentRate = pricing.find(
    (row) =>
      row.effective_from <= today &&
      (row.effective_to === null || row.effective_to >= today),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/products" className="text-sm text-secondary hover:underline">
        ← Back to products
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{product.name}</h1>
          <p className="mt-1 text-sm text-secondary">
            {formatNumber(product.diameter_mm)} mm · {product.grade} · std {formatNumber(product.standard_length_ft)} ft
            {!product.is_active ? " · Inactive" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-sand bg-white px-4 py-2 text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">
            Rate today (PKR/kg)
          </p>
          {currentRate ? (
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {formatRate(currentRate.full_rate)} full · {formatRate(currentRate.cut_rate)} cut
            </p>
          ) : (
            <p className="mt-0.5 text-sm font-medium text-forest">
              No price effective today
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="rounded-xl border border-sand bg-white p-6 lg:col-span-3">
          <h2 className="text-base font-semibold text-ink">Specification</h2>
          <div className="mt-4">
            <ProductForm
              categories={categories}
              values={{
                id: product.id,
                name: product.name,
                grade: product.grade,
                category_id: product.category_id,
                diameter_mm: String(product.diameter_mm),
                wall_thickness_mm: product.wall_thickness_mm === null ? "" : String(product.wall_thickness_mm),
                standard_length_ft: String(product.standard_length_ft),
                theoretical_weight_per_ft: String(product.theoretical_weight_per_ft),
                notes: product.notes ?? "",
                is_active: product.is_active,
              }}
            />
          </div>
        </section>

        <section className="flex flex-col gap-6 lg:col-span-2">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Add price</h2>
            <p className="mt-1 text-xs text-secondary">
              Date ranges may not overlap. The rate applicable on a date is the unique
              row whose range covers it.
            </p>
            <div className="mt-4">
              <PricingForm productId={product.id} />
            </div>
          </div>

          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Price history</h2>
            {pricing.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">
                No prices configured yet. Full and cut sales will have no rate to snapshot.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="py-2 pr-3">From</th>
                      <th className="py-2 pr-3">To</th>
                      <th className="py-2 pr-3 text-right">Full</th>
                      <th className="py-2 pr-3 text-right">Cut</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {pricing.map((row) => {
                      const isCurrent = row.id === currentRate?.id;
                      return (
                        <tr key={row.id}>
                          <td className="py-2 pr-3 tabular-nums text-ink-soft">
                            {row.effective_from}
                            {isCurrent ? (
                              <span className="ml-1 rounded-full bg-forest-fixed px-1.5 py-0.5 text-[10px] font-medium text-forest-ink">
                                current
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-ink-soft">
                            {row.effective_to ?? "open"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                            {formatRate(row.full_rate)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                            {formatRate(row.cut_rate)}
                          </td>
                          <td className="py-2 text-right">
                            <DeletePricingButton pricingId={row.id} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
