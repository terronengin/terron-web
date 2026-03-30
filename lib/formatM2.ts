export function formatM2(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0 m²";
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(num)} m²`;
}
