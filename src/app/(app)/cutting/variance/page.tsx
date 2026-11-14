import Link from "next/link";
import { TrendDown, TrendUp, Scales } from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatNumber, formatPkr } from "@/lib/format";
import StatCard from "@/components/inventory/stat-card";
import StatusChip from "@/components/inventory/status-chip";

type VarianceRow = {
  id: string;
  cut_number: string;
  cut_date: string;
  status: string;
  variance_kg: number;
  variance_value: number;
  inventory_pieces: {
    piece_code: string;
    products: { name: string; grade: string; diameter_mm: number } | null;
  } | null;
  cutting_outputs: { id: string }[];
  scrap_lots: { original_weight_kg: number } | null;
};

export default async function CuttingVariancePage() {
  await connection();
  const supabase = await createClient();

  const { data } = await supabase
    .from("cutting_records")
    .select(
      "id, cut_number, cut_date, status, variance_kg, variance_value, inventory_pieces!cutting_records_source_piece_id_fkey(piece_code, products(name, grade, diameter_mm)), cutting_outputs(id), scrap_lots(original_weight_kg)",
    )
    .or("variance_kg.neq.0,variance_value.neq.0")
    .order("cut_date", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as VarianceRow[];
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const lossCuts = confirmed.filter((r) => Number(r.variance_kg) > 0);
  const gainCuts = confirmed.filter((r) => Number(r.variance_kg) < 0);
  const lossKg = lossCuts.reduce((sum, r) => sum + Number(r.variance_kg), 0);
  const lossValue = lossCuts.reduce((sum, r) => sum + Number(r.variance_value), 0);
  const gainKg = gainCuts.reduce((sum, r) => sum + Math.abs(Number(r.variance_kg)), 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/cutting" className="text-sm text-secondary hover:underline">
        ← Back to cutting
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Cutting variance</h1>
      <p className="mt-1 text-sm text-secondary">
        Source weight minus outputs minus scrap, per cutting operation. A positive variance is an
        unexplained loss and posts to Cutting Loss Expense; a negative variance is an unexplained
        gain and is recorded but never credited.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Cuts with loss (confirmed)"
          value={String(lossCuts.length)}
          icon={<TrendDown size={20} />}
          tone={lossCuts.length > 0 ? "alert" : "default"}
        />
        <StatCard
          label="Total cutting loss"
          value={`${formatNumber(lossKg)} kg · ${formatPkr(lossValue)}`}
          icon={<Scales size={20} />}
          tone={lossValue > 0 ? "alert" : "default"}
        />
        <StatCard
          label="Unexplained gain kg"
          value={formatNumber(gainKg)}
          icon={<TrendUp size={20} />}
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            Every cutting so far reconciles exactly — no variance recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Number</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Source piece</th>
                  <th className="px-6 py-3 text-right">Outputs</th>
                  <th className="px-6 py-3 text-right">Scrap (kg)</th>
                  <th className="px-6 py-3 text-right">Variance (kg)</th>
                  <th className="px-6 py-3 text-right">Loss value</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3">
                      <Link
                        href={`/cutting/${r.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {r.cut_number}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{formatDate(r.cut_date)}</td>
                    <td className="px-6 py-3 text-ink-soft">
                      {r.inventory_pieces?.piece_code ?? "—"}
                      {r.inventory_pieces?.products ? (
                        <span className="block text-xs text-outline">
                          {r.inventory_pieces.products.name} —{" "}
                          {r.inventory_pieces.products.diameter_mm}mm{" "}
                          {r.inventory_pieces.products.grade}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                      {r.cutting_outputs.length}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                      {r.scrap_lots ? formatNumber(r.scrap_lots.original_weight_kg) : "0"}
                    </td>
                    <td
                      className={`px-6 py-3 text-right tabular-nums ${
                        Number(r.variance_kg) > 0
                          ? "font-semibold text-error-ink"
                          : "text-umber-ink"
                      }`}
                    >
                      {formatNumber(r.variance_kg)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-ink-soft">
                      {Number(r.variance_value) > 0 ? formatPkr(r.variance_value) : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <StatusChip status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-outline">
        Reversed cuts keep their original variance for history; their loss was reversed through a
        compensating journal entry and is excluded from the totals above.
      </p>
    </div>
  );
}
