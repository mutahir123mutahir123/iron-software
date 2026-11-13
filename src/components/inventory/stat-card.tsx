import type { ReactNode } from "react";

export default function StatCard({
  label,
  value,
  unit,
  footer,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  footer?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "alert";
}) {
  return (
    <div
      className={`flex flex-col justify-between gap-4 rounded-xl border p-5 shadow-soft ${
        tone === "alert"
          ? "border-error/30 bg-error-soft/40"
          : "border-sand bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-outline">
          {label}
        </p>
        {icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-parchment text-forest">
            {icon}
          </span>
        ) : null}
      </div>
      <div>
        <p className="font-display text-3xl font-semibold leading-none text-ink">
          {value}
          {unit ? (
            <span className="ml-1.5 align-baseline text-sm font-medium text-ink-soft">
              {unit}
            </span>
          ) : null}
        </p>
        {footer ? (
          <div className="mt-2 text-xs leading-relaxed text-ink-soft">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
