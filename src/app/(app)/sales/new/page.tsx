import Link from "next/link";
import { Receipt, Scissors } from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import SaleForm from "@/components/sales/sale-form";
import CutAndSellForm from "@/components/sales/cut-and-sell-form";

type SearchParams = { mode?: string };

type PieceRow = {
  id: string;
  piece_code: string;
  status: string;
  measured_length_ft: number;
  measured_weight_kg: number;
  carrying_value: number;
  product_id: string;
  products: {
    name: string;
    grade: string;
    diameter_mm: number;
  } | null;
};

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { mode } = await searchParams;
  const activeMode = mode === "cut" ? "cut" : "invoice";

  await connection();
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [customersResult, piecesResult, pricingResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("inventory_pieces")
      .select(
        "id, piece_code, status, measured_length_ft, measured_weight_kg, carrying_value, product_id, products(name, grade, diameter_mm)",
      )
      .in("status", ["full", "cut"])
      .order("piece_code"),
    supabase
      .from("product_pricing")
      .select("product_id, full_rate, cut_rate")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
  ]);

  const customers = customersResult.data ?? [];
  const pieces = (piecesResult.data ?? []) as unknown as PieceRow[];

  const cutRates: Record<string, number> = {};
  for (const row of pricingResult.data ?? []) {
    cutRates[row.product_id] = Number(row.cut_rate);
  }

  const tabClass = (tab: string) =>
    `flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
      activeMode === tab
        ? "bg-forest text-forest-on-container"
        : "border border-outline-soft text-ink-soft hover:bg-sand"
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/sales" className="text-sm text-secondary hover:underline">
        ← Back to sales
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">New sale</h1>
      <p className="mt-1 text-sm text-secondary">
        Create a draft invoice for existing pieces, or sell a partial length with one
        atomic cut &amp; sale.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/sales/new" aria-current={activeMode === "invoice" ? "page" : undefined} className={tabClass("invoice")}>
          <Receipt size={18} />
          Invoice existing stock
        </Link>
        <Link href="/sales/new?mode=cut" aria-current={activeMode === "cut" ? "page" : undefined} className={tabClass("cut")}>
          <Scissors size={18} />
          Cut &amp; sell partial length
        </Link>
      </div>

      <div className="mt-6">
        {activeMode === "invoice" ? (
          <div className="max-w-3xl rounded-xl border border-sand bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Invoice details</h2>
            <p className="mt-1 text-xs text-secondary">
              Create the draft, then add full shafts, cut pieces or scrap lots as lines on
              the next screen. Rates pre-fill from the price list (editable); the applied
              rate is snapshotted on the invoice line.
            </p>
            <div className="mt-4">
              <SaleForm customers={customers} />
            </div>
          </div>
        ) : pieces.length === 0 ? (
          <div className="rounded-xl border border-sand bg-white p-10 text-center">
            <p className="text-sm text-secondary">
              No pieces available to cut. Confirm a purchase first to bring shafts into
              stock.
            </p>
            <Link
              href="/purchases/new"
              className="mt-4 inline-flex h-11 items-center rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
            >
              New purchase
            </Link>
          </div>
        ) : (
          <CutAndSellForm
            pieces={pieces}
            customers={customers}
            rates={cutRates}
          />
        )}
      </div>
    </div>
  );
}
