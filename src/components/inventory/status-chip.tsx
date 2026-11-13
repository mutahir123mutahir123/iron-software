const statusStyles: Record<string, string> = {
  full: "bg-forest-fixed text-forest-ink",
  cut: "bg-umber-fixed text-umber-ink",
  reserved: "bg-secondary-container text-secondary-on-container",
  split: "bg-linen text-ink-soft",
  sold: "bg-shade text-ink-soft",
  scrapped: "bg-error-soft text-error-ink",
  available: "bg-forest-fixed text-forest-ink",
};

export default function StatusChip({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-linen text-ink-soft";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style}`}
    >
      {status}
    </span>
  );
}
