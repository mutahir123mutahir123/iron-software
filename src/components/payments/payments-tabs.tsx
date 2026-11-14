import Link from "next/link";

export default function PaymentsTabs({ active }: { active: "payments" | "expenses" }) {
  const base =
    "rounded-md px-4 py-2 text-sm font-medium transition-colors";
  return (
    <div className="flex rounded-lg border border-outline-soft bg-white p-1">
      <Link
        href="/payments"
        aria-current={active === "payments" ? "page" : undefined}
        className={`${base} ${
          active === "payments"
            ? "bg-forest text-forest-on-container"
            : "text-ink-soft hover:bg-sand"
        }`}
      >
        Payments
      </Link>
      <Link
        href="/expenses"
        aria-current={active === "expenses" ? "page" : undefined}
        className={`${base} ${
          active === "expenses"
            ? "bg-forest text-forest-on-container"
            : "text-ink-soft hover:bg-sand"
        }`}
      >
        Expenses
      </Link>
    </div>
  );
}
