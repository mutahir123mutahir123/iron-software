import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatNumber, formatPkr } from "@/lib/format";
import StatusChip from "@/components/inventory/status-chip";
import ReverseCuttingButton from "@/components/cutting/reverse-cutting-button";

type OutputRow = {
  id: string;
  measured_length_ft: number;
  measured_weight_kg: number;
  allocated_value: number;
  piece_id: string;
  inventory_pieces: {
    piece_code: string;
    status: string;
  } | null;
};

export default async function CuttingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const [cutResult, outputsResult, scrapResult, journalResult] = await Promise.all([
    supabase
      .from("cutting_records")
      .select(
        "*, inventory_pieces!cutting_records_source_piece_id_fkey(id, piece_code, status, measured_length_ft, measured_weight_kg, carrying_value, products(name, grade, diameter_mm))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("cutting_outputs")
      .select(
        "id, piece_id, measured_length_ft, measured_weight_kg, allocated_value, inventory_pieces(piece_code, status)",
      )
      .eq("cutting_record_id", id)
      .order("created_at"),
    supabase
      .from("scrap_lots")
      .select(
        "id, lot_number, original_weight_kg, remaining_weight_kg, carrying_value, remaining_value, status",
      )
      .eq("cutting_record_id", id)
      .maybeSingle(),
    supabase
      .from("journal_entries")
      .select("id, description, journal_lines(debit, credit, accounts(code, name))")
      .eq("reference_id", id)
      .in("reference_type", ["cutting", "cutting_reversal"])
      .order("created_at"),
  ]);

  const cut = cutResult.data;
  if (!cut) notFound();

  const source = cut.inventory_pieces as unknown as {
    id: string;
    piece_code: string;
    status: string;
    measured_length_ft: number;
    measured_weight_kg: number;
    carrying_value: number;
    products: { name: string; grade: string; diameter_mm: number } | null;
  } | null;

  const outputs = (outputsResult.data ?? []) as unknown as OutputRow[];
  const scrap = scrapResult.data;
  const entries = (journalResult.data ?? []) as unknown as {
    id: string;
    description: string | null;
    journal_lines: {
      debit: number;
      credit: number;
      accounts: { code: string; name: string } | null;
    }[];
  }[];

  const outputsKg = outputs.reduce((sum, o) => sum + Number(o.measured_weight_kg), 0);
  const outputsValue = outputs.reduce((sum, o) => sum + Number(o.allocated_value), 0);
  const isReversed = cut.status === "reversed";
  const lossValue = Number(cut.variance_value);
  const sourceKg = source ? Number(source.measured_weight_kg) : 0;
  const reconciles =
    source !== null &&
    Math.abs(sourceKg - outputsKg - Number(scrap?.original_weight_kg ?? 0) - Number(cut.variance_kg)) <
      0.0001;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/cutting" className="text-sm text-secondary hover:underline">
        ← Back to cutting
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold text-ink">{cut.cut_number}</h1>
            <StatusChip status={cut.status} />
          </div>
          <p className="mt-1 text-sm text-secondary">
            {formatDate(cut.cut_date)}
            {cut.reference ? ` · Ref ${cut.reference}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-sand bg-white px-4 py-2 text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">
            Variance
          </p>
          <p
            className={`mt-0.5 text-lg font-semibold tabular-nums ${
              Number(cut.variance_kg) > 0 ? "text-error-ink" : "text-ink"
            }`}
          >
            {formatNumber(cut.variance_kg)} kg
          </p>
          {lossValue > 0 ? (
            <p className="text-xs tabular-nums text-error-ink">{formatPkr(lossValue)} loss</p>
          ) : null}
        </div>
      </div>

      {isReversed ? (
        <p className="mt-4 rounded-xl border border-error/30 bg-error-soft/40 px-4 py-3 text-sm text-error-ink">
          This cutting was reversed. The source piece was restored and the outputs were retired.
          The original record and journal entries are preserved for history.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="flex flex-col gap-6 lg:col-span-3">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Source piece</h2>
            {source ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <Link
                    href={`/inventory/${source.id}`}
                    className="font-medium text-forest hover:underline"
                  >
                    {source.piece_code}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {source.products?.name} — {source.products?.diameter_mm}mm{" "}
                    {source.products?.grade}
                  </p>
                  <p className="mt-0.5 text-xs text-outline">
                    {formatNumber(source.measured_weight_kg)} kg ·{" "}
                    {formatNumber(source.measured_length_ft)} ft · carrying value{" "}
                    {formatPkr(source.carrying_value)} (unchanged at cut time)
                  </p>
                </div>
                <StatusChip status={source.status} />
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">
              Output pieces — {outputs.length}
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="py-2 pr-3">Piece</th>
                    <th className="py-2 pr-3 text-right">Length (ft)</th>
                    <th className="py-2 pr-3 text-right">Weight (kg)</th>
                    <th className="py-2 pr-3 text-right">Allocated value</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand">
                  {outputs.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-3">
                        {o.inventory_pieces ? (
                          <Link
                            href={`/inventory/${o.piece_id}`}
                            className="font-medium text-forest hover:underline"
                          >
                            {o.inventory_pieces.piece_code}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {formatNumber(o.measured_length_ft)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {formatNumber(o.measured_weight_kg)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink">
                        {formatPkr(o.allocated_value)}
                      </td>
                      <td className="py-2">
                        {o.inventory_pieces ? <StatusChip status={o.inventory_pieces.status} /> : null}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3 text-ink">Total</td>
                    <td className="py-2 pr-3" />
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {formatNumber(outputsKg)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink">
                      {formatPkr(outputsValue)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {scrap ? (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Scrap lot</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Lot</dt>
                  <dd className="mt-0.5 text-ink">{scrap.lot_number}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Weight</dt>
                  <dd className="mt-0.5 tabular-nums text-ink">
                    {formatNumber(scrap.remaining_weight_kg)} /{" "}
                    {formatNumber(scrap.original_weight_kg)} kg
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Value</dt>
                  <dd className="mt-0.5 tabular-nums text-ink">
                    {formatPkr(scrap.remaining_value)} / {formatPkr(scrap.carrying_value)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Status</dt>
                  <dd className="mt-0.5">
                    <StatusChip status={scrap.status} />
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {cut.notes ? (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Notes</h2>
              <p className="mt-2 text-sm text-ink-soft">{cut.notes}</p>
            </div>
          ) : null}

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-sand bg-white p-6"
            >
              <h2 className="text-base font-semibold text-ink">
                Journal entry — {entry.description}
              </h2>
              <table className="mt-3 w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-secondary">
                  <tr>
                    <th className="py-2 pr-3">Account</th>
                    <th className="py-2 pr-3 text-right">Debit</th>
                    <th className="py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand">
                  {entry.journal_lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-ink">
                        {line.accounts
                          ? `${line.accounts.code} · ${line.accounts.name}`
                          : "Unknown account"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                        {Number(line.debit) > 0 ? formatPkr(line.debit) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink-soft">
                        {Number(line.credit) > 0 ? formatPkr(line.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-6 lg:col-span-2">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Reconciliation</h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Source</dt>
                <dd className="tabular-nums text-ink">
                  {formatNumber(sourceKg)} kg
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Outputs + scrap + variance</dt>
                <dd className="tabular-nums text-ink">
                  {formatNumber(outputsKg)} + {formatNumber(scrap?.original_weight_kg ?? 0)} +{" "}
                  {formatNumber(cut.variance_kg)} kg
                </dd>
              </div>
              <div className="flex items-center justify-between border-t border-sand pt-2">
                <dt className="font-medium text-ink">Balance</dt>
                <dd
                  className={`tabular-nums font-semibold ${
                    reconciles ? "text-forest" : "text-error-ink"
                  }`}
                >
                  {reconciles ? "Reconciled" : "Mismatch"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-outline">
              Scrap is tracked separately from shaft stock and excluded from shaft WAC. The source
              value was transferred to the outputs, the scrap lot and any cutting loss — never to
              revenue.
            </p>
          </div>

          {!isReversed ? (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Reversal</h2>
              <p className="mt-1 text-xs text-secondary">
                Allowed only while every output piece is still an untouched cut piece and the scrap
                lot is fully available. Once any output has been sold or cut again, a corrective
                process is required instead.
              </p>
              <div className="mt-3">
                <ReverseCuttingButton
                  cuttingRecordId={cut.id}
                  cutNumber={cut.cut_number}
                  outputCount={outputs.length}
                  hasScrap={scrap !== null}
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
