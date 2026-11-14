import Link from "next/link";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const { q, show } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const showInactive = show === "all";

  await connection();
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, phone, address, is_active, created_at")
    .order("name");

  const filtered = (suppliers ?? []).filter((s) => {
    if (!showInactive && !s.is_active) return false;
    if (!query) return true;
    return [s.name, s.phone ?? "", s.address ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Suppliers</h1>
          <p className="mt-1 text-sm text-secondary">
            Supplier master records and purchase history.
          </p>
        </div>
        <Link
          href="/suppliers/new"
          className="flex h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
        >
          <Plus size={18} weight="bold" />
          Add supplier
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/suppliers">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, phone or address…"
            aria-label="Search suppliers"
            className="h-11 w-full rounded-lg border border-outline-soft bg-white pl-10 pr-3 text-sm text-ink outline-none focus:border-forest focus:ring-2 focus:ring-forest/20"
          />
        </div>
        <button
          type="submit"
          className="h-11 rounded-lg border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sand"
        >
          Search
        </button>
        <Link
          href={showInactive ? "/suppliers" : "/suppliers?show=all"}
          className="h-11 rounded-lg border border-outline-soft px-4 text-sm font-medium leading-[2.75rem] text-ink-soft transition-colors hover:bg-sand"
        >
          {showInactive ? "Active only" : "Show all"}
        </Link>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {query
              ? "No suppliers match your search."
              : "No suppliers yet. Add your first supplier to start recording purchases."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Supplier</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Address</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {filtered.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3">
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{s.phone ?? "—"}</td>
                    <td className="px-6 py-3 text-ink-soft">{s.address ?? "—"}</td>
                    <td className="px-6 py-3">
                      {s.is_active ? (
                        <span className="text-xs font-semibold uppercase tracking-wide text-forest">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs font-semibold uppercase tracking-wide text-outline">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
