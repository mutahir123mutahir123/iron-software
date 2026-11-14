import Link from "next/link";
import {
  Package,
  Wallet,
  Recycle,
  Scales,
  MagnifyingGlass,
  ArrowRight,
  Info,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatNumber, formatPkr, formatRate } from "@/lib/format";
import StatusChip from "@/components/inventory/status-chip";
import StatCard from "@/components/inventory/stat-card";

const PAGE_SIZE = 15;

type SearchParams = {
  q?: string;
  product?: string;
  status?: string;
  page?: string;
};

const statusFilters = [
  { value: "", label: "All" },
  { value: "full", label: "Full shafts" },
  { value: "cut", label: "Cut pieces" },
  { value: "reserved", label: "Reserved" },
  { value: "split", label: "Split" },
  { value: "sold", label: "Sold" },
];

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const s = search.toString();
  return s ? `/inventory?${s}` : "/inventory";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, product, status, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const statusFilter = statusFilters.some((s) => s.value === status) ? status : "";
  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  await connection();
  const supabase = await createClient();

  const [
    productsResult,
    stockBalancesResult,
    costBalancesResult,
    scrapResult,
    reconciliationResult,
    fullCount,
    cutCount,
    reservedCount,
    splitCount,
    soldCount,
    allCount,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, grade, diameter_mm, wall_thickness_mm, standard_length_ft")
      .order("name"),
    supabase.from("product_stock_balances").select("total_kg, total_ft, piece_count"),
    supabase.from("product_cost_balances").select("total_kg, total_value"),
    supabase
      .from("scrap_lots")
      .select("remaining_weight_kg, remaining_value")
      .eq("status", "available"),
    supabase.from("inventory_reconciliation").select(
      "product_id, stock_balance_kg, pieces_kg, cost_balance_value, pieces_value, stock_balance_piece_count, pieces_piece_count",
    ),
    supabase.from("inventory_pieces").select("id", { count: "exact", head: true }).eq("status", "full"),
    supabase.from("inventory_pieces").select("id", { count: "exact", head: true }).eq("status", "cut"),
    supabase.from("inventory_pieces").select("id", { count: "exact", head: true }).eq("status", "reserved"),
    supabase.from("inventory_pieces").select("id", { count: "exact", head: true }).eq("status", "split"),
    supabase.from("inventory_pieces").select("id", { count: "exact", head: true }).eq("status", "sold"),
    supabase.from("inventory_pieces").select("id", { count: "exact", head: true }),
  ]);

  const products = productsResult.data ?? [];

  const stockKg = (stockBalancesResult.data ?? []).reduce((s, r) => s + Number(r.total_kg), 0);
  const stockPieces = (stockBalancesResult.data ?? []).reduce(
    (s, r) => s + Number(r.piece_count),
    0,
  );
  const costKg = (costBalancesResult.data ?? []).reduce((s, r) => s + Number(r.total_kg), 0);
  const costValue = (costBalancesResult.data ?? []).reduce(
    (s, r) => s + Number(r.total_value),
    0,
  );
  const blendedWac = costKg > 0 ? costValue / costKg : null;

  const scrapKg = (scrapResult.data ?? []).reduce(
    (s, r) => s + Number(r.remaining_weight_kg),
    0,
  );
  const scrapValue = (scrapResult.data ?? []).reduce(
    (s, r) => s + Number(r.remaining_value),
    0,
  );

  const reconciliationRows = reconciliationResult.data ?? [];
  const driftedProducts = reconciliationRows.filter(
    (r) =>
      Math.abs(Number(r.stock_balance_kg) - Number(r.pieces_kg)) > 0.005 ||
      Math.abs(Number(r.cost_balance_value) - Number(r.pieces_value)) > 0.5 ||
      Number(r.stock_balance_piece_count) !== Number(r.pieces_piece_count),
  ).length;

  const statusCounts: Record<string, number> = {
    "": allCount.count ?? 0,
    full: fullCount.count ?? 0,
    cut: cutCount.count ?? 0,
    reserved: reservedCount.count ?? 0,
    split: splitCount.count ?? 0,
    sold: soldCount.count ?? 0,
  };

  // Piece list with filters
  const matchingProductIds = query
    ? products
        .filter((p) =>
          [p.name, p.grade, String(p.diameter_mm)].join(" ").toLowerCase().includes(query),
        )
        .map((p) => p.id)
    : [];

  let piecesQuery = supabase
    .from("inventory_pieces")
    .select(
      `id, piece_code, status, measured_length_ft, measured_weight_kg, carrying_value, created_at,
       product_id,
       products ( name, grade, diameter_mm, wall_thickness_mm, standard_length_ft ),
       purchase_items ( purchases ( purchase_number, suppliers ( name ) ) ),
       cutting_records!inventory_pieces_cutting_record_id_fkey ( cut_number ),
       parent:inventory_pieces!inventory_pieces_parent_piece_id_fkey ( piece_code )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter) piecesQuery = piecesQuery.eq("status", statusFilter);
  if (product) piecesQuery = piecesQuery.eq("product_id", product);
  if (query) {
    const clauses = [`piece_code.ilike.%${query}%`];
    if (matchingProductIds.length > 0) {
      clauses.push(`product_id.in.(${matchingProductIds.join(",")})`);
    }
    piecesQuery = piecesQuery.or(clauses.join(","));
  }

  const piecesResult = await piecesQuery;
  const pieces = piecesResult.data ?? [];
  const totalPieces = piecesResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalPieces / PAGE_SIZE));
  const showingFrom = totalPieces === 0 ? 0 : from + 1;
  const showingTo = Math.min(from + PAGE_SIZE, totalPieces);

  const filterParams = { q: query || undefined, product: product || undefined, status: statusFilter || undefined };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest">
            Warehouse Operations
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
            Physical Inventory
          </h1>
          <p className="mt-1 max-w-md text-sm text-ink-soft">
            Piece-level tracking, weighted-average costing and lineage for every
            shaft in the yard.
          </p>
        </div>
        <Link
          href="/inventory/reconciliation"
          className="flex items-center gap-2 rounded-xl border border-outline-soft bg-card px-4 py-2.5 text-sm font-semibold text-forest transition-all hover:border-forest hover:text-forest-deep active:scale-[0.98]"
        >
          <Scales size={18} weight="bold" />
          Reconciliation
        </Link>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-sand bg-parchment px-4 py-2.5 text-xs text-ink-soft">
        <Info size={16} className="mt-0.5 shrink-0 text-forest" />
        Pieces enter inventory through confirmed purchases (Phase 4) and cutting
        (Phase 5) — there is no manual piece entry, so stock always carries a
        cost trail.
      </p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Asset Valuation"
          value={formatPkr(costValue)}
          icon={<Wallet size={20} weight="bold" />}
          footer={
            blendedWac !== null ? (
              <>
                Weighted avg: <span className="font-semibold text-forest">PKR {formatRate(blendedWac)} / kg</span>
                <br />
                {formatNumber(costKg)} kg on hand
              </>
            ) : (
              "No valued stock yet"
            )
          }
        />
        <StatCard
          label="Available Stock"
          value={formatNumber(stockPieces, 0)}
          unit="pieces"
          icon={<Package size={20} weight="bold" />}
          footer={
            <>
              <span className="font-semibold text-ink">{formatNumber(stockKg)} kg</span>{" "}
              sellable
              <br />
              <span className="font-semibold text-ink">{statusCounts.full} full</span> ·{" "}
              <span className="font-semibold text-ink">{statusCounts.cut} cut</span> ·{" "}
              <span className="font-semibold text-umber">{statusCounts.reserved} reserved</span>
            </>
          }
        />
        <StatCard
          label="Scrap Reserve"
          value={formatNumber(scrapKg)}
          unit="kg"
          icon={<Recycle size={20} weight="bold" />}
          footer={
            scrapKg > 0 ? (
              <>
                Carrying value: <span className="font-semibold text-ink">{formatPkr(scrapValue)}</span>
                <br />
                Tracked separately from shaft WAC
              </>
            ) : (
              "No scrap lots yet"
            )
          }
        />
        <StatCard
          label="Reconciliation"
          value={driftedProducts === 0 ? "Balanced" : `${driftedProducts} drift`}
          icon={<Scales size={20} weight="bold" />}
          tone={driftedProducts === 0 ? "default" : "alert"}
          footer={
            driftedProducts === 0 ? (
              <>
                Aggregates match the sum of
                <br />
                eligible pieces for all products
              </>
            ) : (
              <Link href="/inventory/reconciliation" className="font-semibold text-error underline underline-offset-2">
                View drifted products
              </Link>
            )
          }
        />
      </div>

      {/* Filters */}
      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-sand bg-card p-4 shadow-soft"
      >
        <div className="flex min-w-52 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-xs font-semibold text-ink-soft">
            Search piece code or product
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="e.g. SH-25G60-041 or 25mm"
            className="h-11 rounded-xl border border-outline-soft bg-cream px-3 text-sm text-ink outline-none transition-shadow placeholder:text-outline focus:border-forest focus:ring-2 focus:ring-forest/25"
          />
        </div>
        <div className="flex min-w-44 flex-col gap-1.5">
          <label htmlFor="product" className="text-xs font-semibold text-ink-soft">
            Product spec
          </label>
          <select
            id="product"
            name="product"
            defaultValue={product ?? ""}
            className="h-11 rounded-xl border border-outline-soft bg-cream px-3 text-sm text-ink outline-none focus:border-forest"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="flex h-11 items-center gap-2 rounded-xl bg-forest px-5 text-sm font-bold text-white transition-all hover:bg-forest-deep active:scale-[0.98]"
        >
          <MagnifyingGlass size={18} weight="bold" />
          Filter
        </button>
        {(query || product || statusFilter) && (
          <Link
            href="/inventory"
            className="flex h-11 items-center rounded-xl border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-parchment"
          >
            Reset
          </Link>
        )}
      </form>

      {/* Status chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {statusFilters.map((s) => {
          const isActive = statusFilter === s.value;
          return (
            <Link
              key={s.value || "all"}
              href={buildQuery({ ...filterParams, status: s.value || undefined, page: undefined })}
              aria-current={isActive ? "true" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                isActive
                  ? "bg-forest text-white"
                  : "border border-outline-soft bg-card text-ink-soft hover:border-forest hover:text-forest"
              }`}
            >
              {s.label}
              <span
                className={`tabular-nums ${isActive ? "text-forest-fixed" : "text-outline"}`}
              >
                {statusCounts[s.value] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Table */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-sand bg-card shadow-soft">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-sand text-[11px] font-bold uppercase tracking-[0.12em] text-outline">
              <th className="px-5 py-4">Piece code</th>
              <th className="px-5 py-4">Product spec</th>
              <th className="px-5 py-4 text-right">Length</th>
              <th className="px-5 py-4 text-right">Scale wt</th>
              <th className="px-5 py-4 text-right">Carrying value</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-parchment">
            {pieces.map((piece) => {
              const p = piece.products as unknown as {
                name: string;
                grade: string;
                diameter_mm: number;
                wall_thickness_mm: number | null;
                standard_length_ft: number;
              } | null;
              const purchaseItem = piece.purchase_items as unknown as {
                purchases: { purchase_number: string; suppliers: { name: string } | null } | null;
              } | null;
              const cutRecord = piece.cutting_records as unknown as { cut_number: string } | null;
              const parent = piece.parent as unknown as { piece_code: string } | null;

              let originLine: string;
              if (parent) {
                originLine = `Child of ${parent.piece_code}`;
              } else if (purchaseItem?.purchases) {
                originLine = `${purchaseItem.purchases.purchase_number}${
                  purchaseItem.purchases.suppliers?.name
                    ? ` · ${purchaseItem.purchases.suppliers.name}`
                    : ""
                }`;
              } else if (cutRecord) {
                originLine = cutRecord.cut_number;
              } else {
                originLine = "—";
              }

              const perKg =
                Number(piece.measured_weight_kg) > 0
                  ? Number(piece.carrying_value) / Number(piece.measured_weight_kg)
                  : null;

              return (
                <tr key={piece.id} className="transition-colors hover:bg-parchment/60">
                  <td className="px-5 py-4">
                    <div className="font-mono text-[13px] font-semibold text-ink">
                      {piece.piece_code}
                    </div>
                    <div className="mt-0.5 max-w-44 truncate text-[11px] text-outline" title={originLine}>
                      {originLine}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-ink">{p?.name ?? "—"}</div>
                    <div className="text-[11px] text-outline">
                      {p
                        ? `${formatNumber(p.diameter_mm)} mm${
                            p.wall_thickness_mm ? ` × ${formatNumber(p.wall_thickness_mm)} mm wall` : ""
                          } · ${p.grade} · ${formatNumber(p.standard_length_ft)} ft std`
                        : ""}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                    {formatNumber(piece.measured_length_ft)} ft
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                    {formatNumber(piece.measured_weight_kg)} kg
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="tabular-nums font-medium text-ink">
                      {formatPkr(piece.carrying_value)}
                    </div>
                    {perKg !== null ? (
                      <div className="text-[11px] tabular-nums text-outline">
                        @ {formatRate(perKg)} / kg
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <StatusChip status={piece.status} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/inventory/${piece.id}`}
                      aria-label={`View piece ${piece.piece_code}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-forest transition-all hover:bg-forest-fixed/50 hover:text-forest-deep active:scale-95"
                    >
                      <ArrowRight size={18} weight="bold" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {pieces.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center">
                  <Package size={36} weight="duotone" className="mx-auto text-outline-soft" />
                  <p className="mt-3 font-semibold text-ink">
                    {allCount.count === 0 ? "No pieces in inventory yet" : "No pieces match these filters"}
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-ink-soft">
                    {allCount.count === 0
                      ? "Physical shafts appear here once a purchase is confirmed and received (Phase 4)."
                      : "Try a different piece code, product or status."}
                  </p>
                  {allCount.count !== 0 ? (
                    <Link
                      href="/inventory"
                      className="mt-4 inline-block rounded-xl border border-outline-soft px-4 py-2 text-xs font-semibold text-ink-soft hover:bg-parchment"
                    >
                      Clear filters
                    </Link>
                  ) : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft">
        <p>
          Showing{" "}
          <span className="font-semibold tabular-nums text-ink">
            {showingFrom}–{showingTo}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-ink">{totalPieces}</span> pieces
          <span className="hidden sm:inline"> · registered since receiving or cutting</span>
        </p>
        {totalPages > 1 ? (
          <nav aria-label="Pagination" className="flex items-center gap-2">
            {currentPage > 1 ? (
              <Link
                href={buildQuery({ ...filterParams, page: String(currentPage - 1) })}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-soft text-ink-soft transition-colors hover:border-forest hover:text-forest"
                aria-label="Previous page"
              >
                <CaretLeft size={16} weight="bold" />
              </Link>
            ) : null}
            <span className="px-2 tabular-nums text-ink-soft">
              Page <span className="font-semibold text-ink">{currentPage}</span> of{" "}
              {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link
                href={buildQuery({ ...filterParams, page: String(currentPage + 1) })}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-outline-soft text-ink-soft transition-colors hover:border-forest hover:text-forest"
                aria-label="Next page"
              >
                <CaretRight size={16} weight="bold" />
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
