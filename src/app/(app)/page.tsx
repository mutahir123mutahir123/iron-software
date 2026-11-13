import Link from "next/link";
import { Package, SquaresFour, Scales, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let businessName = "Iron Merchant";
  let pieceCount: number | null = null;
  if (user) {
    const [settingsResult, piecesResult] = await Promise.all([
      supabase
        .from("business_settings")
        .select("business_name")
        .eq("owner_id", user.id)
        .maybeSingle(),
      supabase
        .from("inventory_pieces")
        .select("id", { count: "exact", head: true })
        .in("status", ["full", "cut", "reserved"]),
    ]);
    businessName = settingsResult.data?.business_name ?? businessName;
    pieceCount = piecesResult.count ?? 0;
  }

  const cards = [
    {
      href: "/inventory",
      icon: Package,
      title: "Inventory",
      body:
        pieceCount === null
          ? "Piece-level stock, carrying value and lineage."
          : `${pieceCount} piece${pieceCount === 1 ? "" : "s"} on hand. Track weights, carrying value and lineage.`,
    },
    {
      href: "/products",
      icon: SquaresFour,
      title: "Products",
      body: "Specifications, categories and effective-dated selling rates.",
    },
    {
      href: "/inventory/reconciliation",
      icon: Scales,
      title: "Reconciliation",
      body: "Aggregate balances vs physical pieces — catch drift early.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6 lg:py-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest">
        {businessName}
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Dashboard
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        Operational dashboards, cash positions and reports arrive in the later
        phases. What is ready today:
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col justify-between gap-6 rounded-xl border border-sand bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:border-forest/40"
            >
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest-fixed text-forest">
                  <Icon size={22} weight="fill" />
                </span>
                <h2 className="mt-4 font-display text-xl font-semibold text-ink">
                  {card.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {card.body}
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-forest transition-transform group-hover:translate-x-1">
                Open <ArrowRight size={14} weight="bold" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
