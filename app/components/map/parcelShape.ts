import type { Feature, FeatureCollection, Polygon } from "geojson";
import { parsePropertyCoords, stableMapItemId } from "./map.data";
import type { MapItem } from "./map.types";

const METERS_PER_DEG_LAT = 111320;

function metersPerDegLng(atLatDeg: number): number {
  return METERS_PER_DEG_LAT * Math.cos((atLatDeg * Math.PI) / 180);
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashUnit(seed: string): number {
  return hashSeed(seed) / 4294967296;
}

function shoelaceArea(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

const MIN_VERTICES = 5;
const MAX_VERTICES = 9;
const DEFAULT_AREA_M2 = 1000;

/**
 * Gerçek tapu/kadastro sınırı yok (TKGM verisi açık değil) — bu yüzden arsanın
 * gerçek m²'sine alan olarak birebir eşleşen, deterministik (aynı id → hep aynı
 * şekil) ve düzensiz kenarlı (gerçek parsel gibi) bir poligon üretiyoruz.
 * Amaç: haritada nokta yerine "arsa şekli" hissi vermek, gerçek tapu verisi değil.
 */
export function generateParcelPolygon(item: MapItem): Feature<Polygon, { id: string }> | null {
  const c = parsePropertyCoords(item);
  if (!c) return null;

  const id = stableMapItemId(item);
  const areaM2 = Math.max(50, Number(item.total_area_m2) || DEFAULT_AREA_M2);

  const vertexCount = MIN_VERTICES + (hashSeed(`${id}|n`) % (MAX_VERTICES - MIN_VERTICES + 1));
  const rotation = hashUnit(`${id}|rot`) * Math.PI * 2;

  const angles: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const jitter = (hashUnit(`${id}|a${i}`) - 0.5) * ((Math.PI / vertexCount) * 0.7);
    angles.push(rotation + (i * 2 * Math.PI) / vertexCount + jitter);
  }

  const r0 = Math.sqrt(areaM2 / Math.PI);
  const rawPointsMeters: [number, number][] = angles.map((a, i) => {
    const r = r0 * (0.72 + hashUnit(`${id}|r${i}`) * 0.56);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

  const rawArea = shoelaceArea(rawPointsMeters);
  const scale = rawArea > 0 ? Math.sqrt(areaM2 / rawArea) : 1;
  const pointsMeters = rawPointsMeters.map(([x, y]) => [x * scale, y * scale] as [number, number]);

  const mPerLng = metersPerDegLng(c.lat);
  const ring: [number, number][] = pointsMeters.map(([dx, dy]) => [
    c.lng + dx / mPerLng,
    c.lat + dy / METERS_PER_DEG_LAT,
  ]);
  ring.push(ring[0]!);

  return {
    type: "Feature",
    id,
    properties: { id },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function buildParcelShapesGeo(items: readonly MapItem[]): FeatureCollection<Polygon, { id: string }> {
  const features: Feature<Polygon, { id: string }>[] = [];
  for (const it of items) {
    const f = generateParcelPolygon(it);
    if (f) features.push(f);
  }
  return { type: "FeatureCollection", features };
}

export type SimpleBounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** buildHierarchyIndex'in getPolygonBounds hook'u için — parsel/mahalle/ilçe bbox'ları artık şekil kapsar. */
export function parcelPolygonBoundsFor(item: MapItem): SimpleBounds | null {
  const f = generateParcelPolygon(item);
  if (!f) return null;
  const ring = f.geometry.coordinates[0]!;
  let minLng = ring[0]![0]!;
  let maxLng = minLng;
  let minLat = ring[0]![1]!;
  let maxLat = minLat;
  for (const [lng, lat] of ring) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return { minLng, minLat, maxLng, maxLat };
}
