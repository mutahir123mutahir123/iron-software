import Link from "next/link";
import { Recycle, Package, Coins } from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatNumber, formatPkr } from "@/lib/format";
import StatCard from "@/components/inventory/stat-card";
import StatusChip from "@/components/inventory/status-chip";

type SearchParams = {
  status?: string;
};

const statusFilters = [
  { value: "", label: "All" },
  { value: "available", label: "Available" },
  { value: "sold", label: "Sold" },
  { value: "scrapped", label: "Scrapped" },
];

type ScrapRow = {
  id: string;
  lot_number: string;
  original_weight_kg: number;
  remaining_weight_kg: number;
  carrying_value: number;
  remaining_value: number;
  status: string;
  created_at: string;
  cutting_record_id: string | null;
  products: { name: string; grade: string; diameter_mm: number } | null;
  cutting_records: { cut_number: string } | null;
};

export default async function ScrapStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { status } = await searchParams;
  const statusFilter = statusFilters.some((s) => s.value === status) ? (status ?? "") : "";

  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("scrap_lots")
    .select(
      "id, lot_number, original_weight_kg, remaining_weight_kg, carrying_value, remaining_value, status, created_at, cutting_record_id, products(name, grade, diameter_mm), cutting_records(cut_number)",
    )
    .order("created_at", { ascending: false });

  const lots = (data ?? []) as unknown as ScrapRow[];

  const available = lots.filter((l) => l.status === "available");
  const availableKg = available.reduce((sum, l) => sum + Number(l.remaining_weight_kg), 0);
  const availableValue = available.reduce((sum, l) => sum + Number(l.remaining_value), 0);

  const filtered = statusFilter ? lots.filter((l) => l.status === statusFilter) : lots;

  function buildQuery(value?: string) {
    return value ? `/cutting/scrap?status=${value}` : "/cutting/scrap";
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/cutting" className="text-sm text-secondary hover:underline">
        ← Back to cutting
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Scrap stock</h1>
      <p className="mt-1 text-sm text-secondary">
        Offcuts produced by cutting, tracked separately from sellable shaft stock and valued at
        their allocated carrying cost.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Available lots"
          value={String(available.length)}
          icon={<Package size={20} />}
        />
        <StatCard
          label="Available weight"
          value={`${formatNumber(availableKg)} kg`}
          icon={<Recycle size={20} />}
        />
        <StatCard
          label="Available value"
          value={formatPkr(availableValue)}
          icon={<Coins size={20} />}
        />
      </div>

      <div className="mt-6 flex rounded-lg border border-outline-soft bg-white p-1 w-fit">
        {statusFilters.map((s) => (
          <Link
            key={s.value}
            href={buildQuery(s.value || undefined)}
            aria-pressed={statusFilter === s.value}
            className={`rounded-md px-4 text-sm font-medium leading-9 transition-colors ${
              statusFilter === s.value
                ? "bg-forest text-forest-on-container"
                : "text-ink-soft hover:bg-sand"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {statusFilter
              ? "No scrap lots with this status."
              : "No scrap lots yet. Scrap is recorded automatically when a cut produces offcuts."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Lot</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">Source cut</th>
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3 text-right">Remaining (kg)</th>
                  <th className="px-6 py-3 text-right">Original (kg)</th>
                  <th className="px-6 py-3 text-right">Remaining value</th>
                  <th className="px-6 py-3 text-right">Original value</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {filtered.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3 font-medium text-ink">{l.lot_number}</td>
                    <td className="px-6 py-3 text-ink-soft">{formatDate(l.created_at)}</td>
                    <td className="px-6 py-3 text-ink-soft">
                      {l.cutting_record_id && l.cutting_records ? (
                        <Link
                          href={`/cutting/${l.cutting_record_id}`}
                          className="font-medium text-forest hover:underline"
                        >
                          {l.cutting_records.cut_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-3 text-ink-soft">
                      {l.products ? (
                        <>
                          {l.products.name} — {l.products.diameter_mm}mm {l.products.grade}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink">
                      {formatNumber(l.remaining_weight_kg)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                      {formatNumber(l.original_weight_kg)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink">
                      {formatPkr(l.remaining_value)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                      {formatPkr(l.carrying_value)}
                    </td>
                    <td className="px-6 py-3">
                      <StatusChip status={l.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-outline">
        Scrap sales are recorded from Sales &amp; Invoices (scrap pricing). Scrap is never included
        in the shaft WAC denominator.
      </p>
    </div>
  );
}
