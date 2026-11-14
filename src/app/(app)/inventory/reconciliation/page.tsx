import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, Scales, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatPkr } from "@/lib/format";

const KG_TOLERANCE = 0.005;
const VALUE_TOLERANCE = 0.5;

export default async function ReconciliationPage() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_reconciliation")
    .select("*")
    .order("product_name");

  const rows = data ?? [];

  const totals = rows.reduce(
    (acc, r) => ({
      stock_balance_kg: acc.stock_balance_kg + Number(r.stock_balance_kg),
      pieces_kg: acc.pieces_kg + Number(r.pieces_kg),
      cost_balance_value: acc.cost_balance_value + Number(r.cost_balance_value),
      pieces_value: acc.pieces_value + Number(r.pieces_value),
      stock_balance_piece_count:
        acc.stock_balance_piece_count + Number(r.stock_balance_piece_count),
      pieces_piece_count: acc.pieces_piece_count + Number(r.pieces_piece_count),
    }),
    {
      stock_balance_kg: 0,
      pieces_kg: 0,
      cost_balance_value: 0,
      pieces_value: 0,
      stock_balance_piece_count: 0,
      pieces_piece_count: 0,
    },
  );

  function rowDrift(r: (typeof rows)[number]) {
    const kg = Number(r.stock_balance_kg) - Number(r.pieces_kg);
    const value = Number(r.cost_balance_value) - Number(r.pieces_value);
    const pieces =
      Number(r.stock_balance_piece_count) - Number(r.pieces_piece_count);
    const balanced =
      Math.abs(kg) <= KG_TOLERANCE &&
      Math.abs(value) <= VALUE_TOLERANCE &&
      pieces === 0;
    return { kg, value, pieces, balanced };
  }

  const driftCount = rows.filter((r) => !rowDrift(r).balanced).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <Link
        href="/inventory"
        className="inline-flex items-center gap-2 text-sm font-semibold text-forest transition-colors hover:text-forest-deep"
      >
        <ArrowLeft size={16} weight="bold" />
        Inventory
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Stock Reconciliation
          </h1>
          <p className="mt-1 max-w-lg text-sm text-ink-soft">
            Aggregate stock and cost balances versus the sum of eligible physical
            pieces (status: full, cut, reserved).
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide ${
            driftCount === 0
              ? "bg-forest-fixed text-forest-ink"
              : "bg-error-soft text-error-ink"
          }`}
        >
          {driftCount === 0 ? (
            <>
              <CheckCircle size={16} weight="fill" /> Balanced
            </>
          ) : (
            <>
              <WarningCircle size={16} weight="fill" /> {driftCount} product(s) drifted
            </>
          )}
        </span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-sand bg-card shadow-soft">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-sand text-[11px] font-bold uppercase tracking-[0.12em] text-outline">
              <th className="px-5 py-4">Product</th>
              <th className="px-5 py-4 text-right">Balance kg</th>
              <th className="px-5 py-4 text-right">Pieces kg</th>
              <th className="px-5 py-4 text-right">Δ kg</th>
              <th className="px-5 py-4 text-right">Balance value</th>
              <th className="px-5 py-4 text-right">Pieces value</th>
              <th className="px-5 py-4 text-right">Δ value</th>
              <th className="px-5 py-4 text-center">Pieces</th>
              <th className="px-5 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parchment">
            {rows.map((r) => {
              const drift = rowDrift(r);
              return (
                <tr key={r.product_id} className="transition-colors hover:bg-parchment/60">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-ink">{r.product_name}</div>
                    <div className="text-[11px] text-outline">{r.grade}</div>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                    {formatNumber(r.stock_balance_kg)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                    {formatNumber(r.pieces_kg)}
                  </td>
                  <td
                    className={`px-5 py-4 text-right tabular-nums font-medium ${
                      Math.abs(drift.kg) > KG_TOLERANCE ? "text-error" : "text-forest"
                    }`}
                  >
                    {drift.kg >= 0 ? "+" : ""}
                    {formatNumber(drift.kg)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                    {formatPkr(r.cost_balance_value)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-ink-soft">
                    {formatPkr(r.pieces_value)}
                  </td>
                  <td
                    className={`px-5 py-4 text-right tabular-nums font-medium ${
                      Math.abs(drift.value) > VALUE_TOLERANCE ? "text-error" : "text-forest"
                    }`}
                  >
                    {drift.value >= 0 ? "+" : ""}
                    {formatPkr(drift.value)}
                  </td>
                  <td className="px-5 py-4 text-center tabular-nums text-ink-soft">
                    {r.stock_balance_piece_count} / {r.pieces_piece_count}
                  </td>
                  <td className="px-5 py-4">
                    {drift.balanced ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-forest">
                        <CheckCircle size={16} weight="fill" /> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-error">
                        <WarningCircle size={16} weight="fill" /> Drift
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-14 text-center">
                  <Scales size={36} weight="duotone" className="mx-auto text-outline-soft" />
                  <p className="mt-3 font-semibold text-ink">No products yet</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Products and pieces appear here once stock begins to move.
                  </p>
                </td>
              </tr>
            ) : null}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-sand bg-parchment/60 text-sm font-semibold text-ink">
                <td className="px-5 py-4">All products</td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {formatNumber(totals.stock_balance_kg)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {formatNumber(totals.pieces_kg)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {formatNumber(totals.stock_balance_kg - totals.pieces_kg)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {formatPkr(totals.cost_balance_value)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {formatPkr(totals.pieces_value)}
                </td>
                <td className="px-5 py-4 text-right tabular-nums">
                  {formatPkr(totals.cost_balance_value - totals.pieces_value)}
                </td>
                <td className="px-5 py-4 text-center tabular-nums">
                  {totals.stock_balance_piece_count} / {totals.pieces_piece_count}
                </td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-sand bg-parchment p-4 text-xs leading-relaxed text-ink-soft">
        <p className="font-semibold text-ink">How to read this</p>
        <p className="mt-1">
          Aggregate balances are only ever written by database RPCs (purchase
          confirmation, cutting, sales, reversals) alongside the physical piece
          records, inside one transaction. Eligible stock excludes
          split/sold/scrapped pieces. Any non-zero Δ means a defect or manual
          interference — investigate before posting further transactions; do
          not &quot;fix&quot; the balance tables by hand.
        </p>
      </div>
    </div>
  );
}
