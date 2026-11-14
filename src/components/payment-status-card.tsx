import Link from "next/link";
import { CheckCircle, Receipt } from "@phosphor-icons/react/dist/ssr";
import { formatPkr } from "@/lib/format";

export default function PaymentStatusCard({
  total,
  allocated,
  recordHref,
}: {
  total: number;
  allocated: number;
  recordHref: string;
}) {
  const outstanding = Math.max(0, total - allocated);

  return (
    <div className="rounded-xl border border-sand bg-white p-6">
      <h2 className="text-base font-semibold text-ink">Payment status</h2>
      <dl className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-secondary">Allocated (paid)</dt>
          <dd className="tabular-nums text-ink">{formatPkr(allocated)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-sand pt-3">
          <dt className="font-semibold text-ink">Outstanding</dt>
          <dd
            className={`tabular-nums font-semibold ${
              outstanding > 0 ? "text-ink" : "text-forest-ink"
            }`}
          >
            {formatPkr(outstanding)}
          </dd>
        </div>
      </dl>
      {outstanding > 0 ? (
        <Link
          href={recordHref}
          className="mt-4 flex h-11 items-center justify-center gap-2 rounded-lg bg-forest px-4 text-sm font-semibold text-forest-on-container transition-colors hover:bg-forest-deep"
        >
          <Receipt size={17} />
          Record payment
        </Link>
      ) : (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-forest-fixed px-4 py-2.5 text-xs font-semibold text-forest-ink">
          <CheckCircle size={16} weight="fill" />
          Fully paid
        </p>
      )}
    </div>
  );
}
