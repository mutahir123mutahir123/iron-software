import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import { formatDate, formatNumber, formatPkr, formatRate } from "@/lib/format";
import SaleForm from "@/components/sales/sale-form";
import AddSaleLineForm, {
  type PieceOption,
  type LotOption,
} from "@/components/sales/add-sale-line-form";
import RemoveLineButton from "@/components/sales/remove-line-button";
import ConfirmSaleButton from "@/components/sales/confirm-sale-button";
import ReverseSaleButton from "@/components/sales/reverse-sale-button";
import DeleteSaleButton from "@/components/sales/delete-sale-button";
import PrintButton from "@/components/sales/print-button";
import StatusChip from "@/components/inventory/status-chip";
import PaymentStatusCard from "@/components/payment-status-card";

type LineRow = {
  id: string;
  sale_type: string;
  inventory_piece_id: string | null;
  scrap_lot_id: string | null;
  rate: number;
  weight_kg: number;
  amount: number;
  cost: number;
  inventory_pieces: { piece_code: string; status: string } | null;
  scrap_lots: { lot_number: string; status: string } | null;
  products: { name: string; grade: string; diameter_mm: number } | null;
};

const typeLabels: Record<string, string> = {
  full: "Full shaft",
  cut: "Cut piece",
  scrap: "Scrap",
};

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const supabase = await createClient();

  const [saleResult, linesResult, customersResult, allocationsResult] = await Promise.all([
    supabase
      .from("sales")
      .select("*, customers(name, phone, address)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sale_items")
      .select(
        "id, sale_type, inventory_piece_id, scrap_lot_id, rate, weight_kg, amount, cost, inventory_pieces(piece_code, status), scrap_lots(lot_number, status), products(name, grade, diameter_mm)",
      )
      .eq("sale_id", id)
      .order("created_at"),
    supabase.from("customers").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("payment_allocations")
      .select("amount, payments!inner(status)")
      .eq("sale_id", id)
      .eq("payments.status", "posted"),
  ]);

  const sale = saleResult.data;
  if (!sale) notFound();

  const lines = (linesResult.data ?? []) as unknown as LineRow[];
  const customers = customersResult.data ?? [];

  const isDraft = sale.status === "draft";
  const saleType = sale.sale_type as "full" | "cut" | "scrap";

  const draftTotal = lines.reduce((sum, line) => sum + Number(line.amount), 0);
  const totalCost = lines.reduce((sum, line) => sum + Number(line.cost), 0);

  let pieces: PieceOption[] = [];
  let lots: LotOption[] = [];
  const rates: Record<string, number> = {};

  if (isDraft) {
    if (saleType === "scrap") {
      const { data } = await supabase
        .from("scrap_lots")
        .select(
          "id, lot_number, remaining_weight_kg, remaining_value, product_id, products(name, grade, diameter_mm)",
        )
        .eq("status", "available")
        .order("lot_number");
      lots = (data ?? []) as unknown as LotOption[];
    } else {
      const status = saleType === "full" ? "full" : "cut";
      const [piecesResult, pricingResult] = await Promise.all([
        supabase
          .from("inventory_pieces")
          .select(
            "id, piece_code, status, measured_weight_kg, carrying_value, product_id, products(name, grade, diameter_mm)",
          )
          .eq("status", status)
          .order("piece_code"),
        supabase
          .from("product_pricing")
          .select("product_id, full_rate, cut_rate")
          .lte("effective_from", sale.sale_date)
          .or(`effective_to.is.null,effective_to.gte.${sale.sale_date}`),
      ]);
      pieces = (piecesResult.data ?? []) as unknown as PieceOption[];
      for (const row of pricingResult.data ?? []) {
        rates[row.product_id] = Number(saleType === "full" ? row.full_rate : row.cut_rate);
      }
    }
  }

  const pieceLines = lines.filter((l) => l.inventory_piece_id !== null);
  const scrapLines = lines.filter((l) => l.scrap_lot_id !== null);

  let journals: {
    id: string;
    reference_type: string | null;
    description: string | null;
    lines: { account: string; debit: number; credit: number }[];
  }[] = [];
  const { data: journalEntries } = await supabase
    .from("journal_entries")
    .select("id, reference_type, description, journal_lines(debit, credit, accounts(code, name))")
    .in("reference_type", ["sale", "sale_reversal"])
    .eq("reference_id", sale.id)
    .order("created_at");
  journals = (journalEntries ?? []).map((entry) => ({
    id: entry.id as string,
    reference_type: entry.reference_type as string | null,
    description: entry.description as string | null,
    lines: ((entry.journal_lines ?? []) as unknown as {
      debit: number;
      credit: number;
      accounts: { code: string; name: string } | null;
    }[]).map((line) => ({
      account: line.accounts ? `${line.accounts.code} · ${line.accounts.name}` : "Unknown account",
      debit: Number(line.debit),
      credit: Number(line.credit),
    })),
  }));

  const customer = sale.customers as { name: string; phone: string | null; address: string | null } | null;

  const allocated = ((allocationsResult.data ?? []) as { amount: number }[]).reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 print:py-0 print:max-w-none">
      <Link href="/sales" className="text-sm text-secondary hover:underline print:hidden">
        ← Back to sales
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold text-ink">
              {sale.sale_number}
            </h1>
            <StatusChip status={sale.status} />
          </div>
          <p className="mt-1 text-sm text-secondary">
            {customer?.name ?? "Unknown customer"}
            {" · "}
            {formatDate(sale.sale_date)}
            {" · "}
            {typeLabels[saleType]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isDraft ? <PrintButton /> : null}
        </div>
      </div>

      {/* Printable invoice header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-semibold">{sale.sale_number}</h1>
        <p className="mt-1 text-sm">
          {customer?.name ?? "Unknown customer"} · {formatDate(sale.sale_date)} ·{" "}
          {typeLabels[saleType]}
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="flex flex-col gap-6 lg:col-span-3">
          {isDraft ? (
            <>
              <div className="rounded-xl border border-sand bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Invoice details</h2>
                <div className="mt-4">
                  <SaleForm
                    customers={customers}
                    values={{
                      id: sale.id,
                      customer_id: sale.customer_id ?? "",
                      sale_date: sale.sale_date,
                      notes: sale.notes ?? "",
                    }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-sand bg-white p-6">
                <h2 className="text-base font-semibold text-ink">Add line</h2>
                <p className="mt-1 text-xs text-secondary">
                  {saleType === "scrap"
                    ? "Select a scrap lot and enter the weight to sell."
                    : saleType === "full"
                      ? "Select a full shaft. The rate is pre-filled from the full-shaft price list (editable)."
                      : "Select a cut piece. The rate is pre-filled from the cut price list (editable)."}
                </p>
                <div className="mt-3">
                  <AddSaleLineForm
                    saleId={sale.id}
                    saleType={saleType}
                    pieces={pieces}
                    lots={lots}
                    rates={rates}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-sand bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Invoice details</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Customer</dt>
                  <dd className="mt-0.5 text-ink">{customer?.name}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Date</dt>
                  <dd className="mt-0.5 text-ink">{formatDate(sale.sale_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Type</dt>
                  <dd className="mt-0.5 text-ink">{typeLabels[saleType]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-secondary">Confirmed at</dt>
                  <dd className="mt-0.5 text-ink">
                    {sale.confirmed_at ? formatDate(sale.confirmed_at) : "—"}
                  </dd>
                </div>
                {sale.notes ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-secondary">Notes</dt>
                    <dd className="mt-0.5 text-ink">{sale.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          )}

          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">
              {isDraft ? "Lines" : `Lines — ${lines.length}`}
            </h2>
            {lines.length === 0 ? (
              <p className="mt-3 text-sm text-secondary">
                No lines yet. Add pieces or scrap lots above.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-secondary">
                    <tr>
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3 text-right">Weight (kg)</th>
                      <th className="py-2 pr-3 text-right">Rate</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      {!isDraft ? <th className="py-2 pr-3 text-right">Cost</th> : null}
                      {isDraft ? <th className="py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {[...pieceLines, ...scrapLines].map((line) => (
                      <tr key={line.id}>
                        <td className="py-2 pr-3 text-ink">
                          {line.inventory_pieces ? (
                            <>
                              {line.inventory_pieces.piece_code}
                              <span className="block text-xs text-secondary">
                                {line.products?.name} — {line.products?.diameter_mm}mm{" "}
                                {line.products?.grade}
                              </span>
                            </>
                          ) : (
                            <>
                              {line.scrap_lots?.lot_number}
                              <span className="block text-xs text-secondary">Scrap lot</span>
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {formatNumber(line.weight_kg)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                          {formatRate(line.rate)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-ink">
                          {formatPkr(line.amount)}
                        </td>
                        {!isDraft ? (
                          <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">
                            {formatPkr(line.cost)}
                          </td>
                        ) : null}
                        {isDraft ? (
                          <td className="py-2 text-right print:hidden">
                            <RemoveLineButton lineId={line.id} />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {journals.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-sand bg-white p-6"
            >
              <h2 className="text-base font-semibold text-ink">
                {entry.reference_type === "sale_reversal" ? "Reversal journal" : "Journal entry"}
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
                  {entry.lines.map((line, i) => (
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
          ))}
        </section>

        <section className="flex flex-col gap-6 lg:col-span-2">
          <div className="rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Totals</h2>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-secondary">Lines</dt>
                <dd className="tabular-nums text-ink">{lines.length}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-sand pt-2">
                <dt className="font-semibold text-ink">Invoice total</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {formatPkr(isDraft ? draftTotal : sale.total)}
                </dd>
              </div>
              {!isDraft ? (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="text-secondary">Cost of goods sold</dt>
                    <dd className="tabular-nums text-ink">{formatPkr(totalCost)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-secondary">Gross profit</dt>
                    <dd className="tabular-nums text-ink">
                      {formatPkr(Number(sale.total) - totalCost)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            <p className="mt-3 text-[11px] text-outline">
              Rates are snapshots taken from the applied price (or manual entry for scrap) and
              never change with later price-list updates.
            </p>
          </div>

          {sale.status === "confirmed" ? (
            <PaymentStatusCard
              total={Number(sale.total)}
              allocated={allocated}
              recordHref={
                sale.customer_id
                  ? `/payments/new?direction=received&party_id=${sale.customer_id}`
                  : "/payments/new?direction=received"
              }
            />
          ) : null}

          {isDraft ? (
            <div className="flex flex-col gap-3 rounded-xl border border-sand bg-white p-6 print:hidden">
              <h2 className="text-base font-semibold text-ink">Confirmation</h2>
              <p className="text-xs text-secondary">
                Confirmation consumes the pieces/lots, posts the Accounts Receivable and COGS
                journals, and writes stock movements. It cannot be undone from this screen.
              </p>
              <ConfirmSaleButton
                saleId={sale.id}
                total={formatPkr(draftTotal)}
                lineCount={lines.length}
              />
              <DeleteSaleButton saleId={sale.id} />
            </div>
          ) : null}

          {sale.status === "confirmed" ? (
            <div className="flex flex-col gap-3 rounded-xl border border-sand bg-white p-6 print:hidden">
              <h2 className="text-base font-semibold text-ink">Reversal</h2>
              <p className="text-xs text-secondary">
                A reversal posts a credit note: stock is restored and a compensating journal
                entry is created. The original invoice is kept for history.
              </p>
              <ReverseSaleButton
                saleId={sale.id}
                saleNumber={sale.sale_number}
                lineCount={lines.length}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
