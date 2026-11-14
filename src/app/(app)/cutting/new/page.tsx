import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;
import NewCuttingForm from "@/components/cutting/new-cutting-form";

type PieceRow = {
  id: string;
  piece_code: string;
  status: string;
  measured_length_ft: number;
  measured_weight_kg: number;
  carrying_value: number;
  products: {
    name: string;
    grade: string;
    diameter_mm: number;
  } | null;
};

export default async function NewCuttingPage() {
  await connection();
  const supabase = await createClient();

  const { data } = await supabase
    .from("inventory_pieces")
    .select(
      "id, piece_code, status, measured_length_ft, measured_weight_kg, carrying_value, products(name, grade, diameter_mm)",
    )
    .in("status", ["full", "cut"])
    .order("piece_code");

  const pieces = (data ?? []) as unknown as PieceRow[];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/cutting" className="text-sm text-secondary hover:underline">
        ← Back to cutting
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">New cutting</h1>
      <p className="mt-1 text-sm text-secondary">
        Cut one shaft into measured pieces. The source value is allocated across the outputs and
        any scrap produced; any actual weight loss posts to Cutting Loss Expense.
      </p>

      {pieces.length === 0 ? (
        <div className="mt-6 rounded-xl border border-sand bg-white p-10 text-center">
          <p className="text-sm text-secondary">
            No pieces available for cutting. Confirm a purchase first to bring shafts into stock.
          </p>
          <Link
            href="/purchases/new"
            className="mt-4 inline-flex h-11 items-center rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
          >
            New purchase
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <NewCuttingForm pieces={pieces} />
        </div>
      )}
    </div>
  );
}
