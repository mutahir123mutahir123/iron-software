"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Package,
  SquaresFour,
  Scissors,
  ShoppingBag,
  Receipt,
  Users,
  Truck,
  Wallet,
  ChartBar,
  GearSix,
  List,
  X,
  SignOut,
  Leaf,
} from "@phosphor-icons/react";
import { signOut } from "@/app/(app)/actions";

type NavItem = {
  label: string;
  href?: string;
  icon: typeof House;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: House },
  { label: "Inventory", href: "/inventory", icon: Package },
  { label: "Products", href: "/products", icon: SquaresFour },
  { label: "Cutting Management", icon: Scissors },
  { label: "Purchases", icon: ShoppingBag },
  { label: "Sales & Invoices", icon: Receipt },
  { label: "Customers", icon: Users },
  { label: "Suppliers", icon: Truck },
  { label: "Payments & Expenses", icon: Wallet },
  { label: "Reports", icon: ChartBar },
  { label: "Settings", icon: GearSix },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href !== undefined &&
          (item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`));

        if (!item.href) {
          return (
            <li key={item.label}>
              <span
                aria-disabled="true"
                className="flex cursor-default items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-outline"
              >
                <span className="flex items-center gap-3">
                  <Icon size={20} weight="regular" />
                  {item.label}
                </span>
                <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
                  Soon
                </span>
              </span>
            </li>
          );
        }

        return (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-forest-fixed font-semibold text-forest-ink"
                  : "font-medium text-ink-soft hover:bg-sand hover:text-ink"
              }`}
            >
              <Icon size={20} weight={isActive ? "fill" : "regular"} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand({ businessName }: { businessName: string }) {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest text-forest-on-container shadow-soft">
        <Leaf size={22} weight="fill" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-semibold leading-tight text-ink">
          {businessName}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
          Iron Merchant ERP
        </p>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-sand px-2 pt-4">
      <p className="px-1 text-xs font-medium text-outline">Signed in as owner</p>
      <form action={signOut} className="mt-2">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl border border-outline-soft bg-card px-3 py-2.5 text-sm font-medium text-ink-soft transition-all hover:border-outline hover:text-ink active:scale-[0.98]"
        >
          <SignOut size={18} />
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function AppShell({
  businessName,
  children,
}: {
  businessName: string;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col gap-6 border-r border-sand bg-card px-4 py-6 lg:flex">
        <Brand businessName={businessName} />
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <SidebarFooter />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-sand bg-card/95 px-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-sand"
          >
            <List size={22} />
          </button>
          <span className="font-display text-base font-semibold text-ink">
            {businessName}
          </span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-sand"
          >
            <SignOut size={20} />
          </button>
        </form>
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col gap-6 bg-card px-4 py-6 shadow-soft">
            <div className="flex items-center justify-between">
              <Brand businessName={businessName} />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-sand"
              >
                <X size={22} />
              </button>
            </div>
            <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </nav>
            <SidebarFooter />
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
