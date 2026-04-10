/**
 * Demo ilan koordinatları: GADM ilçe poligonu içi, mahalle anchor kümeleri, minimum mesafe.
 * Sentetik ilçe adı → gerçek poligon eşlemesi merkez mesafesi / coğrafi rol ile yapılır (alfabetik sıra değil).
 */

import {
  bbox,
  booleanPointInPolygon,
  centroid,
  distance as turfDistance,
  point as turfPoint,
} from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { findCitySeedByName, syntheticDistrictIndexFromLabel, type CitySeed } from "@/lib/regions/trRegions";
import { allocateCountsByWeight } from "@/lib/seed/allocateCountsByWeight";
import { hashString32 } from "@/lib/seed/seedWeights";

const COASTAL_CITY_INLAND_BLEND = new Set<string>([
  "Sinop",
  "Samsun",
  "Trabzon",
  "Rize",
  "Giresun",
  "Ordu",
  "Zonguldak",
  "Tekirdağ",
  "Çanakkale",
  "İzmir",
  "Muğla",
  "Antalya",
  "Mersin",
  "Hatay",
  "Yalova",
  "Balıkesir",
  "Edirne",
]);

/** Mahalle slot 0 = merkez yoğun … 11 = çevre seyrek */
const NEIGHBORHOOD_DENSITY_TIER: readonly number[] = [1.65, 1.42, 1.22, 1.05, 0.92, 0.82, 0.72, 0.62, 0.54, 0.46, 0.4, 0.34];

/** İlçe slot 0 Merkez … 7 Sahil — hedef adet ölçeği (4–8 … 15–25 bandına yaklaşır) */
const DISTRICT_SLOT_SCALE: readonly number[] = [2.35, 1.45, 1.12, 1.0, 0.92, 0.78, 0.68, 0.58];

export function pickWeightedDistrictSlotScale(slot: number): number {
  return DISTRICT_SLOT_SCALE[Math.max(0, Math.min(7, slot))] ?? 1;
}

/** `districtSlotWeights` çıktısını ilçe rolüne göre çarp (allocateCountsByWeight öncesi). */
export function applyDistrictTierToWeights(raw: number[]): number[] {
  return raw.map((w, i) => w * pickWeightedDistrictSlotScale(i));
}

/** Mahalle ağırlıklarına merkez/çevre yoğunluk çarpanı uygula. */
export function applyNeighborhoodDensityTiers(raw: number[]): number[] {
  return raw.map((w, i) => w * (NEIGHBORHOOD_DENSITY_TIER[i] ?? 1));
}

export function distributeCountsAcrossNeighborhoods(
  districtTotal: number,
  baseWeights: number[],
  rootSalt: number,
  opts?: { minPer?: number }
): number[] {
  const tiered = applyNeighborhoodDensityTiers(baseWeights);
  const rng = (() => {
    let s = hashString32(`nhDist|${rootSalt}`) >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const jittered = tiered.map((w) => w * (0.88 + rng() * 0.28));
  const autoMin =
    opts?.minPer !== undefined
      ? opts.minPer
      : districtTotal >= 36
        ? 0
        : districtTotal >= 14
          ? 1
          : 0;
  return allocateCountsByWeight(districtTotal, jittered, { minPer: autoMin });
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Haversine km — turf ile uyumlu sonuç */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isFarEnoughFromExistingPoints(
  lng: number,
  lat: number,
  existing: readonly (readonly [number, number])[],
  minMeters: number
): boolean {
  if (existing.length === 0) return true;
  const minKm = minMeters / 1000;
  for (const [elng, elat] of existing) {
    if (haversineKm(lat, lng, elat, elng) < minKm) return false;
  }
  return true;
}

/**
 * bbox içinde uniform, booleanPointInPolygon ile doğrulanır.
 */
export function randomPointInPolygon(
  feature: Feature<Polygon | MultiPolygon>,
  rng: () => number,
  maxAttempts = 100
): [number, number] | null {
  const geom = feature.geometry;
  const fb: Feature<Polygon | MultiPolygon> = { type: "Feature", properties: {}, geometry: geom };
  const box = bbox(fb);
  const minLng = box[0];
  const minLat = box[1];
  const maxLng = box[2];
  const maxLat = box[3];
  const w = maxLng - minLng;
  const h = maxLat - minLat;
  if (w <= 0 || h <= 0) return null;

  const pt: { type: "Point"; coordinates: [number, number] } = { type: "Point", coordinates: [0, 0] };
  for (let i = 0; i < maxAttempts; i++) {
    pt.coordinates = [minLng + rng() * w, minLat + rng() * h];
    if (booleanPointInPolygon(pt, fb)) return pt.coordinates;
  }
  return null;
}

/**
 * Stratum grid ile bbox alt bölgelerinde örnekleme (daha homojen dağılım).
 */
export function randomPointInPolygonStratified(
  feature: Feature<Polygon | MultiPolygon>,
  rng: () => number,
  stratumGrid: number,
  stratumSlot: number,
  maxAttempts = 90
): [number, number] | null {
  const grid = Math.max(1, Math.min(12, Math.floor(stratumGrid)));
  const cells = grid * grid;
  const slot = (stratumSlot >>> 0) % cells;
  const col = slot % grid;
  const row = Math.floor(slot / grid);
  const inv = 1 / grid;

  const geom = feature.geometry;
  const fb: Feature<Polygon | MultiPolygon> = { type: "Feature", properties: {}, geometry: geom };
  const box = bbox(fb);
  const minLng = box[0];
  const minLat = box[1];
  const maxLng = box[2];
  const maxLat = box[3];
  const w = maxLng - minLng;
  const h = maxLat - minLat;
  if (w <= 0 || h <= 0) return null;

  const u0 = col * inv;
  const u1 = (col + 1) * inv;
  const v0 = row * inv;
  const v1 = (row + 1) * inv;

  const pt: { type: "Point"; coordinates: [number, number] } = { type: "Point", coordinates: [0, 0] };
  for (let i = 0; i < maxAttempts; i++) {
    pt.coordinates = [
      minLng + (u0 + rng() * (u1 - u0)) * w,
      minLat + (v0 + rng() * (v1 - v0)) * h,
    ];
    if (booleanPointInPolygon(pt, fb)) return pt.coordinates;
  }
  return randomPointInPolygon(feature, rng, maxAttempts);
}

/**
 * Anchor etrafında küçük kutu içinde örnekle; poligon dışı reddedilir.
 */
export function randomPointNearAnchor(
  anchorLng: number,
  anchorLat: number,
  feature: Feature<Polygon | MultiPolygon>,
  rng: () => number,
  spreadMetersApprox = 650,
  maxAttempts = 55
): [number, number] | null {
  const degLat = spreadMetersApprox / 111_000;
  const degLng = spreadMetersApprox / (111_000 * Math.max(0.2, Math.cos(toRad(anchorLat))));

  const fb: Feature<Polygon | MultiPolygon> = { type: "Feature", properties: {}, geometry: feature.geometry };
  const pt: { type: "Point"; coordinates: [number, number] } = { type: "Point", coordinates: [0, 0] };

  for (let i = 0; i < maxAttempts; i++) {
    const dx = (rng() - 0.5) * 2 * degLng;
    const dy = (rng() - 0.5) * 2 * degLat;
    pt.coordinates = [anchorLng + dx, anchorLat + dy];
    if (booleanPointInPolygon(pt, fb)) return pt.coordinates;
  }
  return null;
}

/** İl merkezine doğru hafif çekiş — kıyı illerinde deniz üstü noktayı azaltır */
export function blendTowardCityInland(
  lng: number,
  lat: number,
  cityCenter: [number, number],
  amount: number
): [number, number] {
  const [cLat, cLng] = cityCenter;
  const t = Math.max(0, Math.min(0.35, amount));
  return [lng + (cLng - lng) * t, lat + (cLat - lat) * t];
}

const slotMapCache = new Map<string, number[]>();

/**
 * Sentetik ilçe slotu (0..7) → `districts` dizisindeki gerçek ilçe indeksi.
 * GADM alfabetik sırası kullanılmaz; il merkezine göre sıralı poligonlardan 8 ayrık seçim.
 */
export function getDistrictIndexForSyntheticSlot(
  cityName: string,
  districts: Feature<Polygon | MultiPolygon>[],
  slot: number
): number {
  const n = districts.length;
  if (n === 0) return 0;
  if (n === 1) return 0;

  const seed = findCitySeedByName(cityName);
  const cLat = seed?.center[0] ?? 39;
  const cLng = seed?.center[1] ?? 35;

  const cacheKey = `${cityName}|${n}|${cLat.toFixed(2)}|${cLng.toFixed(2)}`;
  let mapping = slotMapCache.get(cacheKey);
  if (!mapping || mapping.length !== 8) {
    const scored = districts.map((f, i) => {
      const c = centroid(f);
      const [lng, lat] = c.geometry.coordinates;
      const d = haversineKm(cLat, cLng, lat, lng);
      return { i, d, lat };
    });
    const byCentroid = [...scored].sort((a, b) => a.d - b.d).map((x) => x.i);

    const picks: number[] = [];
    const used = new Set<number>();
    for (let s = 0; s < 8; s++) {
      let j = Math.min(n - 1, Math.floor(((s + 0.5) / 8) * n));
      let idx = byCentroid[j]!;
      let guard = 0;
      while (used.has(idx) && guard < n + 8) {
        j = (j + 1) % n;
        idx = byCentroid[j]!;
        guard++;
      }
      if (!used.has(idx)) {
        used.add(idx);
        picks.push(idx);
      }
    }
    let fill = 0;
    while (picks.length < 8 && fill < n * 2) {
      const idx = byCentroid[fill % n]!;
      if (!used.has(idx)) {
        used.add(idx);
        picks.push(idx);
      }
      fill++;
    }
    while (picks.length < 8) {
      picks.push(byCentroid[0]!);
    }
    mapping = picks.slice(0, 8);
    slotMapCache.set(cacheKey, mapping);
  }

  const s = Math.max(0, Math.min(7, slot));
  return mapping[s] ?? 0;
}

export function buildNeighborhoodAnchors(
  feature: Feature<Polygon | MultiPolygon>,
  nhCount: number,
  rng: () => number
): [number, number][] {
  const anchors: [number, number][] = [];
  const grid = Math.ceil(Math.sqrt(Math.max(1, nhCount)));
  for (let ni = 0; ni < nhCount; ni++) {
    const p = randomPointInPolygonStratified(feature, rng, grid, ni, 100);
    if (p) anchors.push(p);
    else {
      const fb: Feature<Polygon | MultiPolygon> = { type: "Feature", properties: {}, geometry: feature.geometry };
      const c = centroid(fb);
      anchors.push([c.geometry.coordinates[0], c.geometry.coordinates[1]]);
    }
  }
  return anchors;
}

/** Turf distance km */
export function pointDistanceKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  return turfDistance(turfPoint([lng1, lat1]), turfPoint([lng2, lat2]), { units: "kilometers" });
}

export function shouldApplyCoastalInlandBlend(city: string): boolean {
  return COASTAL_CITY_INLAND_BLEND.has(city.trim());
}

export function syntheticSlotFromDistrictLabel(district: string, city: string): number {
  return syntheticDistrictIndexFromLabel(district, city);
}

/** İlçe slotu için hedef ilan ölçeği (4–8 … 15–25 bandına yakın çarpan). */
export function getDistrictPropertyTargetCount(slot: number): number {
  return pickWeightedDistrictSlotScale(slot);
}

/** Özet rol etiketi — ağırlık seçiminde kullanılabilir */
export function pickWeightedDistrictType(
  slot: number
): "core" | "industrial" | "residential" | "coastal" {
  if (slot <= 1) return "core";
  if (slot === 2 || slot === 5) return "industrial";
  if (slot === 6 || slot === 7) return "coastal";
  return "residential";
}
