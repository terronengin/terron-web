import fs from "fs";
import path from "path";
import { bbox, booleanPointInPolygon, pointOnFeature } from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { parseTurkeyLatLng } from "@/lib/map/normalizeCoordinates";
import { seedCoordsFromSyntheticAddress } from "@/lib/map/seedCoords";
import { hashString32 } from "@/lib/seed/seedWeights";
import { syntheticDistrictIndexFromLabel } from "@/lib/regions/trRegions";

function normTR(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

function loadGadmDistrictFC(): FeatureCollection<Polygon | MultiPolygon> {
  const p = path.join(process.cwd(), "public", "geo", "gadm41_TUR_2.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw) as FeatureCollection<Polygon | MultiPolygon>;
}

let cachedDistrictsByCity: Map<string, Feature<Polygon | MultiPolygon>[]> | null = null;

function buildDistrictIndex(): Map<string, Feature<Polygon | MultiPolygon>[]> {
  const fc = loadGadmDistrictFC();
  const map = new Map<string, Feature<Polygon | MultiPolygon>[]>();
  for (const f of fc.features || []) {
    const name1 = String((f.properties as Record<string, unknown>)?.NAME_1 ?? "").trim();
    if (!name1) continue;
    const k = normTR(name1);
    const arr = map.get(k) ?? [];
    arr.push(f as Feature<Polygon | MultiPolygon>);
    map.set(k, arr);
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => {
      const na = String((a.properties as Record<string, unknown>)?.NAME_2 ?? "");
      const nb = String((b.properties as Record<string, unknown>)?.NAME_2 ?? "");
      return na.localeCompare(nb, "tr");
    });
    map.set(k, arr);
  }
  return map;
}

export function getDistrictsForCityNormalized(cityName: string): Feature<Polygon | MultiPolygon>[] {
  if (!cachedDistrictsByCity) cachedDistrictsByCity = buildDistrictIndex();
  return cachedDistrictsByCity.get(normTR(cityName)) ?? [];
}

function sampleLngLatInPolygonFeature(
  feature: Feature<Polygon | MultiPolygon>,
  rng: () => number,
  maxAttempts = 120,
  opts?: { stratumGrid?: number; stratumSlot?: number }
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

  const grid = Math.max(1, Math.min(8, opts?.stratumGrid ?? 1));
  const cells = grid * grid;
  const slot = ((opts?.stratumSlot ?? 0) >>> 0) % cells;
  const col = slot % grid;
  const row = Math.floor(slot / grid);
  const inv = 1 / grid;
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
    if (booleanPointInPolygon(pt, fb)) {
      return pt.coordinates;
    }
  }
  const pon = pointOnFeature(fb);
  const c = pon.geometry.coordinates;
  return [c[0], c[1]];
}

/**
 * Demo/system ilan: GADM ilçe poligonu içinde rastgele nokta (deniz / yanlış bbox önlenir).
 * Sentetik ilçe etiketi (Merkez, Kuzey, …) gerçek ilçe listesinde indekslenir.
 */
export function sampleDemoPropertyLngLat(
  cityName: string,
  districtSynthetic: string,
  neighborhood: string,
  idx: number,
  rng: () => number
): { lat: number; lng: number } | null {
  const districts = getDistrictsForCityNormalized(cityName);
  if (!districts.length) return null;

  const dIdx = syntheticDistrictIndexFromLabel(districtSynthetic, cityName) % districts.length;
  const feat = districts[dIdx];
  if (!feat?.geometry) return null;

  const stratumSlot =
    (hashString32(`${cityName}|${districtSynthetic}|${neighborhood}|${idx}`) ^
      (idx * 0x9e3779b9) ^
      neighborhood.length * 1315423911) >>>
    0;
  const pair = sampleLngLatInPolygonFeature(feat, rng, 140, { stratumGrid: 7, stratumSlot });
  if (!pair) return null;

  let lng = pair[0];
  let lat = pair[1];

  const parsed = parseTurkeyLatLng(lat, lng);
  if (!parsed) return null;

  const inside = booleanPointInPolygon(
    { type: "Point", coordinates: [parsed.lng, parsed.lat] },
    { type: "Feature", properties: {}, geometry: feat.geometry }
  );
  if (!inside) {
    const again = sampleLngLatInPolygonFeature(feat, rng, 80, { stratumGrid: 7, stratumSlot: stratumSlot ^ 0xdeadbeef });
    if (!again) return { lat: parsed.lat, lng: parsed.lng };
    const p2 = parseTurkeyLatLng(again[1], again[0]);
    return p2 ? { lat: p2.lat, lng: p2.lng } : { lat: parsed.lat, lng: parsed.lng };
  }
  return { lat: parsed.lat, lng: parsed.lng };
}

export function demoCoordsOrFallback(
  citySeed: { city: string; center: [number, number]; inlandBias?: [number, number] },
  district: string,
  neighborhood: string,
  idx: number,
  rng: () => number
): { lat: number; lng: number } {
  const fromPoly = sampleDemoPropertyLngLat(citySeed.city, district, neighborhood, idx, rng);
  if (fromPoly) return fromPoly;

  const [cLat, cLng] = citySeed.center;
  const [biLat, biLng] = citySeed.inlandBias ?? [0, 0];
  return seedCoordsFromSyntheticAddress(cLat + biLat, cLng + biLng, citySeed.city, district, neighborhood, idx, rng);
}
