import Link from "next/link";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Blocks on request-time data (session + per-user queries); opt out of instant-navigation validation, like the (app) layout.
export const instant = false;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const { q, show } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const showInactive = show === "all";

  await connection();
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone, address, is_active, created_at")
    .order("name");

  const filtered = (customers ?? []).filter((c) => {
    if (!showInactive && !c.is_active) return false;
    if (!query) return true;
    return [c.name, c.phone ?? "", c.address ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">Customers</h1>
          <p className="mt-1 text-sm text-secondary">
            Customer master records and sale history.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="flex h-11 items-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
        >
          <Plus size={18} weight="bold" />
          Add customer
        </Link>
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2" action="/customers">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <MagnifyingGlass
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
          />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name, phone or address…"
            aria-label="Search customers"
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
          href={showInactive ? "/customers" : "/customers?show=all"}
          className="h-11 rounded-lg border border-outline-soft px-4 text-sm font-medium leading-[2.75rem] text-ink-soft transition-colors hover:bg-sand"
        >
          {showInactive ? "Active only" : "Show all"}
        </Link>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-sand bg-white shadow-soft">
        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-secondary">
            {query
              ? "No customers match your search."
              : "No customers yet. Add your first customer to start invoicing."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-secondary">
                <tr>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Address</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {filtered.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-parchment">
                    <td className="px-6 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-forest hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-ink-soft">{c.phone ?? "—"}</td>
                    <td className="px-6 py-3 text-ink-soft">{c.address ?? "—"}</td>
                    <td className="px-6 py-3">
                      {c.is_active ? (
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
