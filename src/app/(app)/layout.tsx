import type { ReactNode } from "react";
import Link from "next/link";
import AuthGate from "@/components/auth-gate";
import { signOut } from "./actions";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500">
              Iron Merchant
            </span>
            <span className="hidden text-xs text-zinc-500 sm:inline">
              Management System
            </span>
          </div>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Dashboard
            </Link>
            <Link
              href="/products"
              className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Products
            </Link>
          </nav>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col">
        <AuthGate>{children}</AuthGate>
      </main>
    </div>
  );
}
