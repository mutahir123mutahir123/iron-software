export function parsePositiveNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function parseNonNegativeNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
