import fs from "fs";
import path from "path";
import { booleanPointInPolygon } from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { parseTurkeyLatLng } from "@/lib/map/normalizeCoordinates";
import { seedCoordsFromSyntheticAddress } from "@/lib/map/seedCoords";
import {
  blendTowardCityInland,
  buildNeighborhoodAnchors,
  getDistrictIndexForSyntheticSlot,
  isFarEnoughFromExistingPoints,
  randomPointNearAnchor,
  randomPointInPolygonStratified,
  shouldApplyCoastalInlandBlend,
  syntheticSlotFromDistrictLabel,
} from "@/lib/seed/propertyGeoDistribution";
import type { CitySeed } from "@/lib/regions/trRegions";

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

const anchorCache = new Map<string, [number, number][]>();

function anchorKey(city: string, districtIdx: number, nhSlot: number): string {
  return `${normTR(city)}|d${districtIdx}|nh${nhSlot}`;
}

/**
 * Demo ilan: doğru GADM ilçe poligonu + mahalle anchor çevresi + minimum mesafe + kıyıda içe çekiş.
 */
export function sampleDemoPropertyLngLat(
  cityName: string,
  districtSynthetic: string,
  neighborhoodIndex: number,
  idx: number,
  rng: () => number,
  citySeed: CitySeed,
  recentByCluster: Map<string, [number, number][]>
): { lat: number; lng: number } | null {
  const districts = getDistrictsForCityNormalized(cityName);
  if (!districts.length) return null;

  const slot = syntheticSlotFromDistrictLabel(districtSynthetic, cityName);
  const dIdx = getDistrictIndexForSyntheticSlot(cityName, districts, slot);
  const feat = districts[dIdx];
  if (!feat?.geometry) return null;

  const nhSlot = Math.max(0, Math.min(11, neighborhoodIndex));
  const ak = anchorKey(cityName, dIdx, nhSlot);
  let anchors = anchorCache.get(ak);
  if (!anchors || anchors.length < 12) {
    anchors = buildNeighborhoodAnchors(feat, 12, rng);
    anchorCache.set(ak, anchors);
  }
  const anchor = anchors[nhSlot] ?? anchors[0]!;
  const [aLng, aLat] = anchor;

  const minM = 95 + (idx % 7) * 12;
  const clusterKey = `${cityName}|${districtSynthetic}|n${nhSlot}`;
  const prev = recentByCluster.get(clusterKey) ?? [];

  let pair: [number, number] | null = null;
  for (let attempt = 0; attempt < 55; attempt++) {
    const spread = 420 + rng() * 520;
    const p = randomPointNearAnchor(aLng, aLat, feat, rng, spread, 40);
    const cand = p ?? randomPointInPolygonStratified(feat, rng, 5, nhSlot + attempt, 70);
    if (!cand) continue;
    let [lng, lat] = cand;

    if (shouldApplyCoastalInlandBlend(citySeed.city)) {
      const blended = blendTowardCityInland(lng, lat, citySeed.center, 0.1 + rng() * 0.08);
      lng = blended[0];
      lat = blended[1];
      const pt = { type: "Point" as const, coordinates: [lng, lat] };
      if (!booleanPointInPolygon(pt, { type: "Feature", properties: {}, geometry: feat.geometry })) {
        continue;
      }
    }

    if (!isFarEnoughFromExistingPoints(lng, lat, prev, minM)) continue;

    pair = [lng, lat];
    break;
  }

  if (!pair) {
    pair = randomPointInPolygonStratified(feat, rng, 6, nhSlot + idx, 95);
  }
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
    const again = randomPointInPolygonStratified(feat, rng, 7, (idx ^ nhSlot) & 63, 90);
    if (!again) return { lat: parsed.lat, lng: parsed.lng };
    const p2 = parseTurkeyLatLng(again[1], again[0]);
    return p2 ? { lat: p2.lat, lng: p2.lng } : { lat: parsed.lat, lng: parsed.lng };
  }

  const out = { lat: parsed.lat, lng: parsed.lng };
  const arr = prev.slice();
  arr.push([out.lng, out.lat]);
  if (arr.length > 80) arr.shift();
  recentByCluster.set(clusterKey, arr);

  return out;
}

/**
 * Sentetik ilan koordinatı — poligon başarısızsa şehir merkezi spiral yedeği (son çare).
 */
export function demoCoordsOrFallback(
  citySeed: CitySeed,
  district: string,
  neighborhood: string,
  neighborhoodIndex: number,
  idx: number,
  rng: () => number,
  recentByCluster: Map<string, [number, number][]>
): { lat: number; lng: number } {
  const fromPoly = sampleDemoPropertyLngLat(
    citySeed.city,
    district,
    neighborhoodIndex,
    idx,
    rng,
    citySeed,
    recentByCluster
  );
  if (fromPoly) return fromPoly;

  const [cLat, cLng] = citySeed.center;
  const [biLat, biLng] = citySeed.inlandBias ?? [0, 0];
  return seedCoordsFromSyntheticAddress(cLat + biLat, cLng + biLng, citySeed.city, district, neighborhood, idx, rng);
}
