import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, formatPkr, formatRate } from "@/lib/format";
import PurchaseForm from "@/components/purchases/purchase-form";
import AddItemForm from "@/components/purchases/add-item-form";
import DeleteItemButton from "@/components/purchases/delete-item-button";
import ConfirmPurchaseButton from "@/components/purchases/confirm-purchase-button";
import DeletePurchaseButton from "@/components/purchases/delete-purchase-button";
import StatusChip from "@/components/inventory/status-chip";

type ItemRow = {
  id: string;
  product_id: string;
  measured_length_ft: number;
  measured_weight_kg: number;
  purchase_cost: number;
  allocated_landed_cost: number;
  total_value: number;
  products: {
    name: string;
    grade: string;
    diameter_mm: number;
  } | null;
};

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [purchaseResult, itemsResult, suppliersResult, productsResult] = await Promise.all([
    supabase
      .from("purchases")
      .select("*, suppliers(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("purchase_items")
      .select(
        "id, product_id, measured_length_ft, measured_weight_kg, purchase_cost, allocated_landed_cost, total_value, products(name, grade, diameter_mm)",
      )
      .eq("purchase_id", id)
      .order("created_at"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("products")
      .select("id, name, grade, diameter_mm")
      .eq("is_active", true)
      .order("name"),
  ]);

  const purchase = purchaseResult.data;
  if (!purchase) notFound();

  const isDraft = purchase.status === "draft";
  const items = (itemsResult.data ?? []) as unknown as ItemRow[];
  const suppliers = suppliersResult.data ?? [];
  const products = productsResult.data ?? [];

  const subtotal = items.reduce((sum, item) => sum + Number(item.purchase_cost), 0);
  const additionalCosts = Number(purchase.additional_costs);
  const grandTotal = subtotal + additionalCosts;
  const totalKg = items.reduce((sum, item) => sum + Number(item.measured_weight_kg), 0);

  // Per-product allocation preview, mirroring the confirmation RPC
  // (weight-based, remainder to the last-inserted item). Display only;
  // the confirmed values are assigned inside the database transaction.
  const perProduct = new Map<
    string,
    { name: string; ft: number; kg: number; value: number }
  >();
  let remainder = additionalCosts;
  const lastItemId = items.length > 0 ? items[items.length - 1].id : null;
  const allocatedValues = new Map<string, number>();
  for (const item of items) {
    let share: number;
    if (item.id === lastItemId) {
      share = remainder;
    } else {
      share = totalKg > 0
        ? Math.round(((additionalCosts * Number(item.measured_weight_kg)) / totalKg) * 100) / 100
        : 0;
      remainder -= share;
    }
    allocatedValues.set(item.id, share);
  }
  for (const item of items) {
    const share = isDraft
      ? allocatedValues.get(item.id) ?? 0
      : Number(item.allocated_landed_cost);
    const entry = perProduct.get(item.product_id) ?? {
      name: item.products?.name ?? "Unknown product",
      ft: 0,
      kg: 0,
      value: 0,
    };
    entry.ft += Number(item.measured_length_ft);
    entry.kg += Number(item.measured_weight_kg);
    entry.value += Number(item.purchase_cost) + share;
    perProduct.set(item.product_id, entry);
  }

  const involvedProductIds = [...perProduct.keys()];
  const { data: costBalances } = involvedProductIds.length
    ? await supabase
        .from("product_cost_balances")
        .select("product_id, total_kg, total_value")
        .in("product_id", involvedProductIds)
    : { data: [] as { product_id: string; total_kg: number; total_value: number }[] };
  const balanceByProduct = new Map(
    (costBalances ?? []).map((b) => [b.product_id, b]),
  );

  let pieces: { id: string; piece_code: string; purchase_item_id: string | null }[] = [];
  let journalLines: { account: string; debit: number; credit: number }[] = [];
  if (!isDraft && items.length) {
    const [piecesResult, journalResult] = await Promise.all([
      supabase
        .from("inventory_pieces")
        .select("id, piece_code, purchase_item_id")
        .in(
          "purchase_item_id",
          items.map((item) => item.id),
        ),
      supabase
        .from("journal_entries")
        .select("id, journal_lines(debit, credit, accounts(code, name))")
        .eq("reference_type", "purchase")
        .eq("reference_id", purchase.id)
        .limit(1),
    ]);
    pieces = piecesResult.data ?? [];
    const entry = (journalResult.data ?? [])[0];
    journalLines = (entry?.journal_lines ?? []).map((line) => {
      const account = line.accounts as unknown as { code: string; name: string } | null;
      return {
        account: account ? `${account.code} · ${account.name}` : "Unknown account",
        debit: Number(line.debit),
        credit: Number(line.credit),
      };
    });
  }
  const pieceByItem = new Map(pieces.map((p) => [p.purchase_item_id, p]));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/purchases" className="text-sm text-secondary hover:underline">
        ← Back to purchases
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold text-ink">
              {purchase.purchase_number}
            </h1>
            <StatusChip status={purchase.status} />
          </div>
          <p className="mt-1 text-sm text-secondary">
            {(purchase.suppliers as { name: string } | null)?.name ?? "Unknown supplier"}
            {" · "}
            {formatDate(purchase.purchase_date)}
            {purchase.reference ? ` · Ref ${purchase.reference}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-sand bg-white px-4 py-2 text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">
            {isDraft ? "Draft total" : "Purchase total"}
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
            {formatPkr(isDraft ? grandTotal : purchase.total_cost)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="flex flex-col gap-6 lg:col-span-3">
          {isDraft ? (
            <>
              <div className="rounded-xl border border-sand bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Purchase details</h2>
                <div className="mt-4">
                  <PurchaseForm
                    suppliers={suppliers}
                    values={{
                      id: purchase.id,
                      supplier_id: purchase.supplier_id,
                      purchase_date: purchase.purchase_date,
                      reference: purchase.reference ?? "",
                      additional_costs: String(purchase.additional_costs ?? 0),
                      notes: purchase.notes ?? "",
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-sand bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Add shaft</h2>
                <p className="mt-1 text-xs text-secondary">
                  Enter the measured length and weight of each physical shaft received.
                </p>
                <div className="mt-3">
                  <AddItemForm purchaseId={purchase.id} products={products} />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Purchase details</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Supplier</dt>
                  <dd className="mt-0.5 text-ink">
                    {(purchase.suppliers as { name: string } | null)?.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Date</dt>
                  <dd className="mt-0.5 text-ink">{formatDate(purchase.purchase_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Reference</dt>
                  <dd className="mt-0.5 text-ink">{purchase.reference ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Confirmed at</dt>
                  <dd className="mt-0.5 text-ink">
                    {purchase.confirmed_at ? formatDate(purchase.confirmed_at) : "—"}
                  </dd>
                </div>
                {purchase.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-secondary">Notes</dt>
                    <dd className="mt-0.5 text-ink">{purchase.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          )}

          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">
              {isDraft ? "Shafts received" : `Shafts received — ${items.length}`}
            </h2>
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">
                No shafts entered yet. Add each shaft above; every shaft gets its own piece
                code on confirmation.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3 text-right">Length (ft)</th>
                      <th className="py-2 pr-3 text-right">Weight (kg)</th>
                      <th className="py-2 pr-3 text-right">Cost</th>
                      {!isDraft ? <th className="py-2 pr-3 text-right">Allocated</th> : null}
                      {!isDraft ? <th className="py-2 pr-3 text-right">Total value</th> : null}
                      {!isDraft ? <th className="py-2 pr-3">Piece</th> : null}
                      {isDraft ? <th className="py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 pr-3 text-ink">
                          {item.products?.name} — {item.products?.diameter_mm}mm{" "}
                          {item.products?.grade}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {formatNumber(item.measured_length_ft)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {formatNumber(item.measured_weight_kg)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {formatPkr(item.purchase_cost)}
                        </td>
                        {!isDraft ? (
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                            {formatPkr(item.allocated_landed_cost)}
                          </td>
                        ) : null}
                        {!isDraft ? (
                          <td className="py-2 pr-3 text-right tabular-nums text-ink">
                            {formatPkr(item.total_value)}
                          </td>
                        ) : null}
                        {!isDraft ? (
                          <td className="py-2 pr-3">
                            {pieceByItem.get(item.id) ? (
                              <Link
                                href={`/inventory/${pieceByItem.get(item.id)?.id}`}
                                className="font-medium text-forest hover:underline"
                              >
                                {pieceByItem.get(item.id)?.piece_code}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                        {isDraft ? (
                          <td className="py-2 text-right">
                            <DeleteItemButton itemId={item.id} />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!isDraft && journalLines.length > 0 ? (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Journal entry</h2>
              <table className="mt-3 w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3 text-right">Debit</th>
                    <th className="py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand">
                  {journalLines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-ink">{line.account}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {line.debit > 0 ? formatPkr(line.debit) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-soft">
                        {line.credit > 0 ? formatPkr(line.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-6 lg:col-span-2">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Totals</h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Subtotal (items)</dt>
                <dd className="tabular-nums text-ink">{formatPkr(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Landed costs (freight/handling)</dt>
                <dd className="tabular-nums text-ink">{formatPkr(additionalCosts)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-sand pt-2">
                <dt className="font-semibold text-ink">Grand total</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {formatPkr(grandTotal)}
                </dd>
              </div>
            </dl>

            {perProduct.size > 0 ? (
              <div className="mt-5">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-outline">
                  {isDraft ? "WAC after confirmation (preview)" : "Stock after purchase"}
                </h3>
                <div className="mt-2 flex flex-col gap-2">
                  {[...perProduct.entries()].map(([productId, entry]) => {
                    const balance = balanceByProduct.get(productId);
                    const newKg = Number(balance?.total_kg ?? 0) + entry.kg;
                    const newValue = Number(balance?.total_value ?? 0) + entry.value;
                    const wac = newKg > 0 ? newValue / newKg : 0;
                    return (
                      <div
                        key={productId}
                        className="rounded-lg border border-sand bg-parchment px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-ink">{entry.name}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          +{formatNumber(entry.kg)} kg @ {formatPkr(entry.value)} · new stock{" "}
                          {formatNumber(newKg)} kg · WAC{" "}
                          <span className="font-semibold text-ink">
                            {formatRate(wac)}/kg
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
                {isDraft ? (
                  <p className="mt-2 text-[11px] text-outline">
                    Preview only — final values are assigned by the confirmation transaction.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {isDraft ? (
            <div className="flex flex-col gap-3 rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Confirmation</h2>
              <p className="text-xs text-secondary">
                Confirmation creates one piece per shaft, updates WAC and stock balances,
                posts a journal entry (DR Shaft Inventory / CR Accounts Payable) and
                writes stock movements. It cannot be undone from this screen.
              </p>
              <ConfirmPurchaseButton
                purchaseId={purchase.id}
                grandTotal={formatPkr(grandTotal)}
                itemCount={items.length}
              />
              <DeletePurchaseButton purchaseId={purchase.id} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
