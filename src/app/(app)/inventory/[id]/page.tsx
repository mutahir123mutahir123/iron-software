import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Ruler,
  Scales,
  Wallet,
  TreeStructure,
  ClockCounterClockwise,
  Package,
  Scissors,
  ShoppingCart,
  NotePencil,
} from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatPkr, formatRate, formatDate } from "@/lib/format";
import StatusChip from "@/components/inventory/status-chip";

export default async function PieceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const pieceResult = await supabase
    .from("inventory_pieces")
    .select(
      `id, piece_code, status, measured_length_ft, measured_weight_kg, carrying_value,
       notes, created_at, updated_at, purchase_item_id, parent_piece_id, cutting_record_id,
       product_id,
       products ( id, name, grade, diameter_mm, wall_thickness_mm, standard_length_ft, theoretical_weight_per_ft )`,
    )
    .eq("id", id)
    .maybeSingle();

  const piece = pieceResult.data;
  if (!piece) notFound();

  const [
    parentResult,
    childrenResult,
    purchaseResult,
    sourceCuttingResult,
    creatingCuttingResult,
    saleResult,
    movementsResult,
  ] = await Promise.all([
    piece.parent_piece_id
      ? supabase
          .from("inventory_pieces")
          .select("id, piece_code, status")
          .eq("id", piece.parent_piece_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("inventory_pieces")
      .select("id, piece_code, status, measured_weight_kg")
      .eq("parent_piece_id", piece.id)
      .order("created_at"),
    piece.purchase_item_id
      ? supabase
          .from("purchase_items")
          .select(
            `measured_length_ft, measured_weight_kg, purchase_cost, allocated_landed_cost, total_value,
             purchases ( purchase_number, purchase_date, reference, suppliers ( name ) )`,
          )
          .eq("id", piece.purchase_item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("cutting_records")
      .select("id, cut_number, cut_date, status, variance_kg, variance_value")
      .eq("source_piece_id", piece.id)
      .maybeSingle(),
    piece.cutting_record_id
      ? supabase
          .from("cutting_records")
          .select("id, cut_number, cut_date, variance_kg, variance_value")
          .eq("id", piece.cutting_record_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("sale_items")
      .select("rate, weight_kg, amount, sales ( sale_number, sale_date, status, sale_type )")
      .eq("inventory_piece_id", piece.id)
      .maybeSingle(),
    supabase
      .from("stock_movements")
      .select("id, movement_type, quantity_kg, value, document_type, notes, created_at")
      .eq("inventory_piece_id", piece.id)
      .order("created_at", { ascending: true }),
  ]);

  const p = piece.products as unknown as {
    id: string;
    name: string;
    grade: string;
    diameter_mm: number;
    wall_thickness_mm: number | null;
    standard_length_ft: number;
    theoretical_weight_per_ft: number;
  } | null;
  const parent = parentResult.data;
  const children = childrenResult.data ?? [];
  const purchaseItem = purchaseResult.data as unknown as {
    measured_length_ft: number;
    measured_weight_kg: number;
    purchase_cost: number;
    allocated_landed_cost: number;
    total_value: number;
    purchases: {
      purchase_number: string;
      purchase_date: string;
      reference: string | null;
      suppliers: { name: string } | null;
    } | null;
  } | null;
  const sourceCutting = sourceCuttingResult.data;
  const creatingCutting = creatingCuttingResult.data as unknown as {
    cut_number: string;
    cut_date: string;
    variance_kg: number;
    variance_value: number;
  } | null;
  const saleItem = saleResult.data as unknown as {
    rate: number;
    weight_kg: number;
    amount: number;
    sales: {
      sale_number: string;
      sale_date: string;
      status: string;
      sale_type: string;
    } | null;
  } | null;
  const movements = movementsResult.data ?? [];

  const kgPerFt =
    Number(piece.measured_length_ft) > 0
      ? Number(piece.measured_weight_kg) / Number(piece.measured_length_ft)
      : null;
  const valuePerKg =
    Number(piece.measured_weight_kg) > 0
      ? Number(piece.carrying_value) / Number(piece.measured_weight_kg)
      : null;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:py-8">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm font-semibold text-forest transition-colors hover:text-forest-deep"
      >
        <ArrowLeft size={16} weight="bold" />
        Inventory
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {piece.piece_code}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {p ? `${p.name} · registered ${formatDate(piece.created_at)}` : "Unknown product"}
          </p>
        </div>
        <StatusChip status={piece.status} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Measurements & cost */}
          <section className="rounded-xl border border-sand bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Ruler size={20} className="text-forest" />
              Measurements & cost
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Length</dt>
                <dd className="mt-1 tabular-nums text-lg font-semibold text-ink">
                  {formatNumber(piece.measured_length_ft)}{" "}
                  <span className="text-xs font-medium text-ink-soft">ft</span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Weight</dt>
                <dd className="mt-1 tabular-nums text-lg font-semibold text-ink">
                  {formatNumber(piece.measured_weight_kg)}{" "}
                  <span className="text-xs font-medium text-ink-soft">kg</span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">kg / ft</dt>
                <dd className="mt-1 tabular-nums text-lg font-semibold text-ink">
                  {kgPerFt !== null ? formatNumber(kgPerFt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">@ value</dt>
                <dd className="mt-1 tabular-nums text-lg font-semibold text-ink">
                  {valuePerKg !== null ? formatRate(valuePerKg) : "—"}{" "}
                  <span className="text-xs font-medium text-ink-soft">/ kg</span>
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-parchment pt-4">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-outline">
                <Wallet size={16} className="text-forest" />
                Carrying value
              </span>
              <span className="font-display text-2xl font-semibold tabular-nums text-ink">
                {formatPkr(piece.carrying_value)}
              </span>
            </div>
          </section>

          {/* Lineage */}
          <section className="rounded-xl border border-sand bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <TreeStructure size={20} className="text-forest" />
              Lineage
            </h2>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              {/* How this piece was created */}
              {purchaseItem?.purchases ? (
                <div className="rounded-xl bg-parchment p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-outline">
                    <ShoppingCart size={14} />
                    Received via purchase
                  </p>
                  <p className="mt-1.5 font-semibold text-ink">
                    {purchaseItem.purchases.purchase_number}
                    <span className="font-normal text-ink-soft">
                      {" "}
                      · {formatDate(purchaseItem.purchases.purchase_date)}
                      {purchaseItem.purchases.suppliers?.name
                        ? ` · ${purchaseItem.purchases.suppliers.name}`
                        : ""}
                    </span>
                  </p>
                  {purchaseItem.purchases.reference ? (
                    <p className="mt-0.5 text-xs text-ink-soft">
                      Reference: {purchaseItem.purchases.reference}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-xs tabular-nums text-ink-soft">
                    Freight & handling allocated: {formatPkr(purchaseItem.allocated_landed_cost)}
                  </p>
                </div>
              ) : null}

              {creatingCutting ? (
                <div className="rounded-xl bg-parchment p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-outline">
                    <Scissors size={14} />
                    Created by cutting
                  </p>
                  <p className="mt-1.5 font-semibold text-ink">
                    {creatingCutting.cut_number}
                    <span className="font-normal text-ink-soft">
                      {" "}
                      · {formatDate(creatingCutting.cut_date)}
                    </span>
                  </p>
                  {Math.abs(Number(creatingCutting.variance_kg)) > 0 ? (
                    <p className="mt-0.5 text-xs text-umber">
                      Cutting variance: {formatNumber(creatingCutting.variance_kg)} kg (
                      {formatPkr(creatingCutting.variance_value)})
                    </p>
                  ) : null}
                </div>
              ) : null}

              {parent ? (
                <p className="text-ink-soft">
                  Parent piece:{" "}
                  <Link
                    href={`/inventory/${parent.id}`}
                    className="font-mono font-semibold text-forest hover:text-forest-deep hover:underline"
                  >
                    {parent.piece_code}
                  </Link>{" "}
                  <span className="text-xs text-outline">(status: {parent.status})</span>
                </p>
              ) : null}

              {children.length > 0 ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-outline">
                    Output pieces ({children.length})
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/inventory/${child.id}`}
                          className="flex items-center gap-1.5 rounded-full border border-outline-soft bg-cream px-3 py-1 font-mono text-xs font-semibold text-ink transition-colors hover:border-forest hover:text-forest"
                        >
                          {child.piece_code}
                          <StatusChip status={child.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {sourceCutting ? (
                <div className="rounded-xl border border-umber-fixed-dim/50 bg-umber-fixed/30 p-4">
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-umber-ink">
                    <Scissors size={14} />
                    Consumed by cutting
                  </p>
                  <p className="mt-1.5 font-semibold text-ink">
                    {sourceCutting.cut_number}
                    <span className="font-normal text-ink-soft">
                      {" "}
                      · {formatDate(sourceCutting.cut_date)} · cutting record{" "}
                      {sourceCutting.status}
                    </span>
                  </p>
                  {Math.abs(Number(sourceCutting.variance_kg)) > 0 ? (
                    <p className="mt-0.5 text-xs text-umber-ink">
                      Variance: {formatNumber(sourceCutting.variance_kg)} kg (
                      {formatPkr(sourceCutting.variance_value)})
                    </p>
                  ) : null}
                </div>
              ) : null}

              {saleItem?.sales ? (
                <div className="rounded-xl border border-error/20 bg-error-soft/30 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-error-ink">
                    Sold
                  </p>
                  <p className="mt-1.5 font-semibold text-ink">
                    {saleItem.sales.sale_number}
                    <span className="font-normal text-ink-soft">
                      {" "}
                      · {formatDate(saleItem.sales.sale_date)} · {saleItem.sales.sale_type} sale ·{" "}
                      {saleItem.sales.status}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-ink-soft">
                    {formatNumber(saleItem.weight_kg)} kg @ {formatRate(saleItem.rate)} / kg ={" "}
                    {formatPkr(saleItem.amount)}
                  </p>
                </div>
              ) : null}

              {!purchaseItem && !creatingCutting && !parent && children.length === 0 && !sourceCutting && !saleItem ? (
                <p className="text-ink-soft">No lineage recorded yet.</p>
              ) : null}
            </div>
          </section>

          {/* Stock movements */}
          <section className="rounded-xl border border-sand bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <ClockCounterClockwise size={20} className="text-forest" />
              Movement history
            </h2>
            {movements.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">
                No movements recorded for this piece yet. Movements are written by
                purchase, cutting, sale and reversal RPCs.
              </p>
            ) : (
              <ol className="mt-4 border-l-2 border-parchment pl-5">
                {movements.map((m) => (
                  <li key={m.id} className="relative pb-4 last:pb-0">
                    <span
                      className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-forest"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-ink">
                      {m.movement_type}
                      <span
                        className={`ml-2 tabular-nums ${
                          Number(m.quantity_kg) < 0 ? "text-error" : "text-forest"
                        }`}
                      >
                        {Number(m.quantity_kg) > 0 ? "+" : ""}
                        {formatNumber(m.quantity_kg)} kg
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {formatDate(m.created_at)}
                      {m.value !== null ? ` · ${formatPkr(m.value)}` : ""}
                      {m.document_type ? ` · ${m.document_type}` : ""}
                      {m.notes ? ` · ${m.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Side column */}
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-sand bg-card p-6 shadow-soft">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Package size={20} className="text-forest" />
              Product
            </h2>
            {p ? (
              <>
                <p className="mt-3 font-semibold text-ink">{p.name}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Diameter</dt>
                    <dd className="mt-0.5 tabular-nums text-ink-soft">{formatNumber(p.diameter_mm)} mm</dd>
                  </div>
                  {p.wall_thickness_mm ? (
                    <div>
                      <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Wall</dt>
                      <dd className="mt-0.5 tabular-nums text-ink-soft">
                        {formatNumber(p.wall_thickness_mm)} mm
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Grade</dt>
                    <dd className="mt-0.5 text-ink-soft">{p.grade}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Std length</dt>
                    <dd className="mt-0.5 tabular-nums text-ink-soft">
                      {formatNumber(p.standard_length_ft)} ft
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-outline">Theory wt/ft</dt>
                    <dd className="mt-0.5 tabular-nums text-ink-soft">
                      {formatNumber(p.theoretical_weight_per_ft)} kg
                    </dd>
                  </div>
                </dl>
                <Link
                  href={`/products/${p.id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest hover:text-forest-deep hover:underline"
                >
                  Product specification
                  <ArrowLeft size={14} className="rotate-180" />
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">Product record missing.</p>
            )}
          </section>

          {piece.notes ? (
            <section className="rounded-xl border border-sand bg-card p-6 shadow-soft">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <NotePencil size={20} className="text-forest" />
                Notes
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink-soft">{piece.notes}</p>
            </section>
          ) : null}

          <p className="flex items-center gap-1.5 px-1 text-[11px] text-outline">
            <Scales size={14} />
            Weights and values are stored at 4dp and 2dp precision; history is
            append-only.
          </p>
        </div>
      </div>
    </div>
  );
}
