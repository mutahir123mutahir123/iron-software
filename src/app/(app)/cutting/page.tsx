import Link from "next/link";
import {
  Scissors,
  Plus,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  Recycle,
  ForkKnife,
} from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatNumber, formatPkr } from "@/lib/format";
import StatCard from "@/components/inventory/stat-card";
import StatusChip from "@/components/inventory/status-chip";

const PAGE_SIZE = 15;

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
};

const statusFilters = [
  { value: "", label: "All" },
  { value: "confirmed", label: "Confirmed" },
  { value: "reversed", label: "Reversed" },
];

type CutRow = {
  id: string;
  cut_number: string;
  cut_date: string;
  status: string;
  variance_kg: number;
  variance_value: number;
  reference: string | null;
  inventory_pieces: {
    piece_code: string;
    products: { name: string; grade: string; diameter_mm: number } | null;
  } | null;
  cutting_outputs: { id: string; measured_weight_kg: number }[];
  scrap_lots: { lot_number: string; original_weight_kg: number; status: string } | null;
};

export default async function CuttingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, status, page } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const statusFilter = statusFilters.some((s) => s.value === status) ? (status ?? "") : "";
  const currentPage = Math.max(1, Number(page) || 1);

  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cutting_records")
    .select(
      "id, cut_number, cut_date, status, variance_kg, variance_value, reference, inventory_pieces!cutting_records_source_piece_id_fkey(piece_code, products(name, grade, diameter_mm)), cutting_outputs(id, measured_weight_kg), scrap_lots(lot_number, original_weight_kg, status)",
    )
    .order("cut_date", { ascending: false })
    .order("created_at", { ascending: false });

  const cuts = (data ?? []) as unknown as CutRow[];

  const confirmed = cuts.filter((c) => c.status === "confirmed");
  const lossKg = confirmed.reduce((sum, c) => sum + Math.max(0, Number(c.variance_kg)), 0);
  const lossValue = confirmed.reduce((sum, c) => sum + Number(c.variance_value), 0);
  const scrapKg = confirmed.reduce(
    (sum, c) => sum + Number(c.scrap_lots?.original_weight_kg ?? 0),
    0,
  );

  const filtered = cuts.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!query) return true;
    const haystack = [
      c.cut_number,
      c.reference ?? "",
      c.inventory_pieces?.piece_code ?? "",
      c.inventory_pieces?.products?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function buildQuery(params: Record<string, string | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    const s = search.toString();
    return s ? `/cutting?${s}` : "/cutting";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Cutting Management</h1>
          <p className="mt-1 text-sm text-secondary">
            Cut shafts into pieces, track scrap and cutting-loss variance.
          </p>
        </div>
        <Link
          href="/cutting/new"
          className="flex h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
        >
          <Plus size={18} weight="bold" />
          New cutting
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Confirmed cuts"
          value={String(confirmed.length)}
          icon={<Scissors size={20} />}
        />
        <StatCard
          label="Scrap recovered (lot weight)"
          value={`${formatNumber(scrapKg)} kg`}
          icon={<Recycle size={20} />}
        />
        <StatCard
          label="Cutting loss (confirmed)"
          value={`${formatNumber(lossKg)} kg · ${formatPkr(lossValue)}`}
          icon={<ForkKnife size={20} />}
          tone={lossValue > 0 ? "alert" : "default"}
        />
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/cutting">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search cut number, reference or piece…"
            aria-label="Search cuttings"
            className="h-11 w-full rounded-lg border border-outline-soft bg-white pl-10 pr-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <div className="flex rounded-lg border border-outline-soft bg-white p-1">
          {statusFilters.map((s) => (
            <Link
              key={s.value}
              href={buildQuery({ q, status: s.value || undefined })}
              aria-pressed={statusFilter === s.value}
              className={`rounded-md px-3 text-sm font-medium leading-9 transition-colors ${
                statusFilter === s.value
                  ? "bg-forest text-forest-on-container"
                  : "text-ink-soft hover:bg-sand"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {pageRows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {query || statusFilter
              ? "No cuttings match your filters."
              : "No cuttings yet. Record your first cut to split a shaft into pieces."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Number</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Source piece</th>
                  <th className="px-6 py-3 text-right">Outputs</th>
                  <th className="px-6 py-3 text-right">Scrap (kg)</th>
                  <th className="px-6 py-3 text-right">Variance (kg)</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {pageRows.map((c) => {
                  const outputsKg = c.cutting_outputs.reduce(
                    (sum, o) => sum + Number(o.measured_weight_kg),
                    0,
                  );
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-parchment">
                      <td className="px-6 py-3">
                        <Link
                          href={`/cutting/${c.id}`}
                          className="font-medium text-forest hover:underline"
                        >
                          {c.cut_number}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-ink-soft">{formatDate(c.cut_date)}</td>
                      <td className="px-6 py-3 text-ink-soft">
                        {c.inventory_pieces?.piece_code ?? "—"}
                        {c.inventory_pieces?.products ? (
                          <span className="block text-xs text-outline">
                            {c.inventory_pieces.products.name} —{" "}
                            {c.inventory_pieces.products.diameter_mm}mm{" "}
                            {c.inventory_pieces.products.grade}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                        {c.cutting_outputs.length} · {formatNumber(outputsKg)} kg
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                        {c.scrap_lots ? formatNumber(c.scrap_lots.original_weight_kg) : "—"}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                        {formatNumber(c.variance_kg)}
                        {Number(c.variance_kg) > 0 ? (
                          <span className="block text-xs text-error-ink">
                            {formatPkr(c.variance_value)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-6 py-3">
                        <StatusChip status={c.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-secondary">
            Page {safePage} of {totalPages} · {filtered.length} cutting
            {filtered.length === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={buildQuery({ q, status: statusFilter || undefined, page: String(safePage - 1) })}
              aria-label="Previous page"
              aria-disabled={safePage <= 1}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border border-outline-soft text-ink-soft ${
                safePage <= 1 ? "pointer-events-none opacity-40" : "hover:bg-sand"
              }`}
            >
              <CaretLeft size={18} />
            </Link>
            <Link
              href={buildQuery({ q, status: statusFilter || undefined, page: String(safePage + 1) })}
              aria-label="Next page"
              aria-disabled={safePage >= totalPages}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border border-outline-soft text-ink-soft ${
                safePage >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-sand"
              }`}
            >
              <CaretRight size={18} />
            </Link>
          </div>
        </div>
      ) : null}

      <p className="mt-6 flex flex-wrap items-center gap-3 text-xs text-outline">
        <Link href="/cutting/variance" className="font-medium text-forest hover:underline">
          Variance report
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/cutting/scrap" className="font-medium text-forest hover:underline">
          Scrap stock
        </Link>
      </p>
    </div>
  );
}
