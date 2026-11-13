"use client";

import { useActionState } from "react";
import { Leaf } from "@phosphor-icons/react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

const inputClass =
  "h-11 rounded-xl border border-outline-soft bg-cream px-3 text-sm text-ink outline-none transition-shadow placeholder:text-outline focus:border-forest focus:ring-2 focus:ring-forest/25";
const labelClass = "text-sm font-semibold text-ink-soft";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-xl border border-sand bg-card p-8 shadow-soft">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest text-forest-on-container">
          <Leaf size={24} weight="fill" />
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em] text-forest">
          Iron Merchant ERP
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
          Sign in
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Owner/admin access to the management system.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="rounded-xl border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error-ink"
            >
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="h-12 rounded-xl bg-forest text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-forest-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
