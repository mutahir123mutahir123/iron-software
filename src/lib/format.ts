export function formatNumber(value: number | string | null | undefined, maxFractionDigits = 4) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", { maximumFractionDigits: maxFractionDigits });
}

export function formatRate(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
