/**
 * `totalCount` adedini `rawWeights` oranında böler; yuvarlama sonrası toplam birebir tutulur (en büyük kalan yöntemi).
 * `minPer`: her çocuk için taban (toplam yetmezse otomatik düşürülür).
 */
export function allocateCountsByWeight(
  totalCount: number,
  rawWeights: number[],
  opts: { minPer?: number } = {}
): number[] {
  const n = rawWeights.length;
  if (n === 0) return [];
  if (totalCount <= 0) return Array(n).fill(0);

  let minPer = Math.max(0, opts.minPer ?? 0);
  const w = rawWeights.map((x) => Math.max(1e-12, x));
  const sumW = w.reduce((a, b) => a + b, 0);

  while (minPer > 0 && totalCount < n * minPer) {
    minPer -= 1;
  }

  const pool = totalCount - n * minPer;
  if (pool < 0) {
    const m = Math.floor(totalCount / n);
    const rem = totalCount - m * n;
    const out = Array(n).fill(m);
    for (let i = 0; i < rem; i++) out[i] += 1;
    return out;
  }

  const exact = w.map((wi) => (pool * wi) / sumW);
  const floors = exact.map((x) => Math.floor(x));
  const out = floors.map((f) => f + minPer);
  const used = out.reduce((a, b) => a + b, 0);
  let gap = totalCount - used;

  const frac = exact.map((x, i) => ({ i, r: x - Math.floor(x) }));
  frac.sort((a, b) => b.r - a.r || a.i - b.i);

  for (let k = 0; k < gap; k++) {
    out[frac[k % n]!.i] = (out[frac[k % n]!.i] ?? 0) + 1;
  }

  let s = out.reduce((a, b) => a + b, 0);
  const diff = totalCount - s;
  if (diff !== 0 && n > 0) {
    out[0] = (out[0] ?? 0) + diff;
  }

  return out;
}
