/** Mapbox fitBounds için [güneybatı], [kuzeydoğu] — lng/lat */

export type LngLatBoundsTuple = [[number, number], [number, number]];

export type BBoxLike =
  | LngLatBoundsTuple
  | { minLng: number; minLat: number; maxLng: number; maxLat: number };

const EPS = 1e-5;

export function normalizeBounds(input: BBoxLike | null | undefined): LngLatBoundsTuple | null {
  if (!input) return null;
  if (Array.isArray(input) && input.length === 2) {
    const a = input[0];
    const b = input[1];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return null;
    const minLng = Math.min(Number(a[0]), Number(b[0]));
    const maxLng = Math.max(Number(a[0]), Number(b[0]));
    const minLat = Math.min(Number(a[1]), Number(b[1]));
    const maxLat = Math.max(Number(a[1]), Number(b[1]));
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
  }
  const o = input as { minLng: number; minLat: number; maxLng: number; maxLat: number };
  if (
    !Number.isFinite(o.minLng) ||
    !Number.isFinite(o.minLat) ||
    !Number.isFinite(o.maxLng) ||
    !Number.isFinite(o.maxLat)
  ) {
    return null;
  }
  const minLng = Math.min(o.minLng, o.maxLng);
  const maxLng = Math.max(o.minLng, o.maxLng);
  const minLat = Math.min(o.minLat, o.maxLat);
  const maxLat = Math.max(o.minLat, o.maxLat);
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export function isValidBounds(sw: [number, number], ne: [number, number]): boolean {
  const spanLng = ne[0] - sw[0];
  const spanLat = ne[1] - sw[1];
  if (!Number.isFinite(spanLng) || !Number.isFinite(spanLat)) return false;
  return spanLng > EPS && spanLat > EPS;
}

export function getBoundsCenter(sw: [number, number], ne: [number, number]): [number, number] {
  return [(sw[0] + ne[0]) / 2, (sw[1] + ne[1]) / 2];
}
