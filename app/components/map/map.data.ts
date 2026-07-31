import { bbox, booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { TURKEY_REGIONS } from "./map.config";
import type {
  BuildHierarchyIndexOptions,
  CountPointProps,
  HierarchyBounds,
  HierarchyBoundsDraft,
  HierarchyCityNode,
  HierarchyDistrictNode,
  HierarchyIndex,
  HierarchyNeighborhoodNode,
  HierarchyParcelNode,
  HierarchyRegionNode,
  MapItem,
  MapLevel,
  MapViewSelected,
  PipelineStats,
} from "./map.types";

import {
  TR_LAT_MAX,
  TR_LAT_MIN,
  TR_LNG_MAX,
  TR_LNG_MIN,
} from "./map.config";

export function parsePropertyCoords(raw: MapItem): { lat: number; lng: number } | null {
  if (raw.latitude == null || raw.longitude == null) return null;
  let lat = Number(raw.latitude);
  let lng = Number(raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const latOk = lat >= TR_LAT_MIN && lat <= TR_LAT_MAX && lng >= TR_LNG_MIN && lng <= TR_LNG_MAX;
  const maybeSwapped =
    lng >= TR_LAT_MIN &&
    lng <= TR_LAT_MAX &&
    lat >= TR_LNG_MIN &&
    lat <= TR_LNG_MAX &&
    !latOk;
  if (maybeSwapped) {
    const t = lat;
    lat = lng;
    lng = t;
  }

  if (lat < TR_LAT_MIN || lat > TR_LAT_MAX || lng < TR_LNG_MIN || lng > TR_LNG_MAX) return null;
  return { lat, lng };
}

export function mapItemWithParsedCoords(p: MapItem): MapItem | null {
  const c = parsePropertyCoords(p);
  if (!c) return null;
  return { ...p, latitude: c.lat, longitude: c.lng };
}

export function buildValidatedItems(incoming: MapItem[]): { list: MapItem[]; stats: PipelineStats } {
  const total = incoming.length;
  const list: MapItem[] = [];
  let ignored = 0;
  for (const raw of incoming) {
    const m = mapItemWithParsedCoords(raw);
    if (!m) {
      ignored += 1;
      continue;
    }
    list.push(m);
  }
  const validBeforeFallback = list.length;
  const usedFallback = false;
  return {
    list,
    stats: {
      total,
      valid: validBeforeFallback,
      ignored,
      usedFallback,
    },
  };
}

export function stableMapItemId(p: MapItem): string {
  const fromId = String(p.id ?? "").trim();
  if (fromId) return fromId;
  const fromPid = String(p.propertyId ?? "").trim();
  if (fromPid) return fromPid;
  return `ll_${Number(p.latitude).toFixed(6)}_${Number(p.longitude).toFixed(6)}`;
}

export function findMapItemByIdLikeInList(list: MapItem[], raw: string | null | undefined): MapItem | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const sl = s.toLowerCase();
  return (
    list.find((it) => {
      const id = String(it.id ?? "").trim();
      const pid = String(it.propertyId ?? "").trim();
      return id === s || id.toLowerCase() === sl || pid === s || pid.toLowerCase() === sl;
    }) ?? null
  );
}

export function findMapItemByCoords(list: MapItem[], lng: number, lat: number, epsDeg = 2e-4): MapItem | null {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  let best: MapItem | null = null;
  let bestSum = Infinity;
  for (const it of list) {
    if (!Number.isFinite(it.longitude) || !Number.isFinite(it.latitude)) continue;
    const sum = Math.abs(it.longitude - lng) + Math.abs(it.latitude - lat);
    if (sum < bestSum && sum <= epsDeg * 2) {
      bestSum = sum;
      best = it;
    }
  }
  return best;
}

export function extractRawPropertyIdFromFeature(f: { properties?: unknown; id?: unknown }): string | null {
  const p = f?.properties as Record<string, unknown> | undefined;
  if (p?.id != null && String(p.id).trim() !== "") return String(p.id);
  if (p?.propertyId != null && String(p.propertyId).trim() !== "") return String(p.propertyId);
  if (f?.id != null && String(f.id).trim() !== "") return String(f.id);
  return null;
}

export function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

export function normTR(s: unknown) {
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

/** Harita / hierarchy anahtarları için isim normalizasyonu (trim, küçük harf, TR karakter uyumu) */
export function normalizeText(s: unknown): string {
  const t = String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(ilçesi|ilçe|belediyesi|merkez|i̇lçesi)\b/gi, "")
    .trim();
  return normTR(t);
}

/** Stabil slug: normalizeText + boşlukları tire (ör. ic-anadolu, ankara:cankaya parçaları) */
export function hierarchyKeyFromString(s: unknown): string {
  const n = normalizeText(s);
  const slug = n.replace(/\s+/g, "-");
  return slug.length > 0 ? slug : "_empty";
}

function isTurkeyMapItem(item: MapItem): boolean {
  const country = safeStr(item.country).trim();
  return !country || normTR(country) === "turkiye" || normTR(country) === "turkey";
}

function cityKeyForItem(item: MapItem): string {
  const regionName = getItemRegionName(item);
  const rk = hierarchyKeyFromString(regionName);
  const ck = hierarchyKeyFromString(item.city);
  return isTurkeyMapItem(item) ? ck : `${rk}:${ck}`;
}

function districtKeyForItem(item: MapItem): string {
  return `${cityKeyForItem(item)}:${hierarchyKeyFromString(item.district ?? "__none")}`;
}

function neighborhoodKeyForItem(item: MapItem): string {
  return `${districtKeyForItem(item)}:${hierarchyKeyFromString(item.neighborhood ?? "__none")}`;
}

/** city / district / mahalle — trim; hierarchyKeyFromString ile uyumlu slug */
function normalizeMapItemGeographyForKeys(raw: MapItem): MapItem {
  return {
    ...raw,
    city: String(raw.city ?? "").trim(),
    district: raw.district != null && String(raw.district).trim() !== "" ? String(raw.district).trim() : null,
    neighborhood: raw.neighborhood != null && String(raw.neighborhood).trim() !== "" ? String(raw.neighborhood).trim() : null,
  };
}

/**
 * Gerçek koordinatın ilan metnindeki parent (ilçe/mahalle/il) ile coğrafi uyumu.
 * Dışarıdaysa false — haritada sentetik konuma düşürülür.
 */
export function validateRealCoordsAgainstParents(
  item: MapItem,
  ix: HierarchyIndex,
  districtPoly: Feature<Polygon | MultiPolygon> | null
): boolean {
  const c = parsePropertyCoords(item);
  if (!c) return true;

  const pt = point([c.lng, c.lat]);
  const dk = districtKeyForItem(item);
  const nk = neighborhoodKeyForItem(item);
  const pid = stableMapItemId(item);

  const districtNode = ix.districtsByKey[dk];
  const neighborhoodNode = ix.neighborhoodsByKey[nk];

  const polyOk =
    districtPoly &&
    (districtPoly.geometry.type === "Polygon" || districtPoly.geometry.type === "MultiPolygon");
  if (polyOk) {
    if (!booleanPointInPolygon(pt, districtPoly)) {
      console.log(
        `[coords] real coordinate outside parent bounds: id=${pid} city=${item.city} district=${item.district ?? ""} — outside district polygon (${c.lng.toFixed(5)}, ${c.lat.toFixed(5)})`
      );
      return false;
    }
  }

  if (neighborhoodNode?.bounds && isValidBounds(neighborhoodNode.bounds)) {
    if (!pointInBoundsH(neighborhoodNode.bounds, c.lng, c.lat)) {
      console.log(
        `[coords] real coordinate outside parent bounds: id=${pid} — outside neighborhood bounds (${c.lng.toFixed(5)}, ${c.lat.toFixed(5)})`
      );
      return false;
    }
  } else if (districtNode?.bounds && isValidBounds(districtNode.bounds)) {
    if (!pointInBoundsH(districtNode.bounds, c.lng, c.lat)) {
      console.log(
        `[coords] real coordinate outside parent bounds: id=${pid} — outside district bounds (${c.lng.toFixed(5)}, ${c.lat.toFixed(5)})`
      );
      return false;
    }
  } else {
    const ck = cityKeyForItem(item);
    const cityNode = ix.citiesByKey[ck];
    if (cityNode?.bounds && isValidBounds(cityNode.bounds)) {
      if (!pointInBoundsH(cityNode.bounds, c.lng, c.lat)) {
        console.log(
          `[coords] real coordinate outside parent bounds: id=${pid} — outside city bounds (${c.lng.toFixed(5)}, ${c.lat.toFixed(5)})`
        );
        return false;
      }
    }
  }

  return true;
}

// --- Hierarchy bounds (mutable draft → finalize) ---

export function createEmptyBounds(): HierarchyBoundsDraft {
  return { minLng: Infinity, minLat: Infinity, maxLng: -Infinity, maxLat: -Infinity, empty: true };
}

export function extendBounds(bounds: HierarchyBoundsDraft, lng: number, lat: number): void {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
  bounds.empty = false;
  bounds.minLng = Math.min(bounds.minLng, lng);
  bounds.minLat = Math.min(bounds.minLat, lat);
  bounds.maxLng = Math.max(bounds.maxLng, lng);
  bounds.maxLat = Math.max(bounds.maxLat, lat);
}

export function extendBoundsFromBox(bounds: HierarchyBoundsDraft, box: HierarchyBounds): void {
  extendBounds(bounds, box.minLng, box.minLat);
  extendBounds(bounds, box.maxLng, box.minLat);
  extendBounds(bounds, box.maxLng, box.maxLat);
  extendBounds(bounds, box.minLng, box.maxLat);
}

export function finalizeBounds(bounds: HierarchyBoundsDraft): HierarchyBounds | null {
  if (bounds.empty) return null;
  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.maxLng)) return null;
  if (!Number.isFinite(bounds.minLat) || !Number.isFinite(bounds.maxLat)) return null;
  const minLng = Math.min(bounds.minLng, bounds.maxLng);
  const maxLng = Math.max(bounds.minLng, bounds.maxLng);
  const minLat = Math.min(bounds.minLat, bounds.maxLat);
  const maxLat = Math.max(bounds.minLat, bounds.maxLat);
  return Object.freeze({ minLng, minLat, maxLng, maxLat });
}

export function getBoundsCenter(bounds: HierarchyBounds | null): [number, number] | null {
  if (!bounds || !isValidBounds(bounds)) return null;
  return [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2];
}

export function isValidBounds(bounds: HierarchyBounds | null | undefined): boolean {
  if (!bounds) return false;
  const spanLng = bounds.maxLng - bounds.minLng;
  const spanLat = bounds.maxLat - bounds.minLat;
  if (!Number.isFinite(spanLng) || !Number.isFinite(spanLat)) return false;
  return spanLng > 1e-9 && spanLat > 1e-9;
}

function pointInBoundsH(b: HierarchyBounds, lng: number, lat: number): boolean {
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat;
}

/** Kamera fitBounds için [[sw],[ne]] (lng/lat) */
export function hierarchyBoundsToBBoxLike(b: HierarchyBounds): [[number, number], [number, number]] {
  return [
    [b.minLng, b.minLat],
    [b.maxLng, b.maxLat],
  ];
}

/** Tek merkez noktasından küçük bbox (fitBounds için) */
export function expandCenterToBounds(center: [number, number], padDeg: number): HierarchyBounds {
  return {
    minLng: center[0] - padDeg,
    maxLng: center[0] + padDeg,
    minLat: center[1] - padDeg,
    maxLat: center[1] + padDeg,
  };
}

type MutableNode = {
  key: string;
  name: string;
  parentKeys: string[];
  items: MapItem[];
  bounds: HierarchyBoundsDraft;
  childKeys: Set<string>;
};

/** İlçe / mahalle micro-padding (min=max veya çok dar span) */
const DISTRICT_PAD_LNG = 0.08;
const DISTRICT_PAD_LAT = 0.06;
const NEIGHBORHOOD_PAD_LNG = 0.03;
const NEIGHBORHOOD_PAD_LAT = 0.02;

function padMicroBoundsFromCenter(
  lng: number,
  lat: number,
  level: "district" | "neighborhood"
): HierarchyBounds {
  const lngPad = level === "district" ? DISTRICT_PAD_LNG : NEIGHBORHOOD_PAD_LNG;
  const latPad = level === "district" ? DISTRICT_PAD_LAT : NEIGHBORHOOD_PAD_LAT;
  return Object.freeze({
    minLng: lng - lngPad,
    maxLng: lng + lngPad,
    minLat: lat - latPad,
    maxLat: lat + latPad,
  });
}

function centerOfDegenerateBounds(b: HierarchyBounds): [number, number] {
  return [(b.minLng + b.maxLng) / 2, (b.minLat + b.maxLat) / 2];
}

/** Konsol: ilçe `cityKey:ilçeAdı`, mahalle `districtKey:mahalleAdı` */
function boundsDebugLabel(n: MutableNode): string {
  const name = (n.name || "").trim();
  if (n.parentKeys.length >= 3) {
    const dk = n.parentKeys[2] ?? "";
    if (dk && name) return `${dk}:${name}`;
  }
  const city = n.parentKeys[1] ?? "";
  if (city && name) return `${city}:${name}`;
  return n.key;
}

/** Sadece property noktalarından bbox (polygon hariç) */
function boundsFromItemPoints(items: readonly MapItem[]): HierarchyBounds | null {
  const d = createEmptyBounds();
  for (const it of items) {
    const c = parsePropertyCoords(it);
    if (c) extendBounds(d, c.lng, c.lat);
  }
  return finalizeBounds(d);
}

/**
 * İlçe / mahalle: öncelik polygon+point birleşik draft → geçersizse sadece noktalar → dejenere ise micro-padding.
 * count > 0 iken mümkün olduğunca null bounds dönmez.
 */
function ensureDistrictOrNeighborhoodBounds(n: MutableNode, level: "district" | "neighborhood"): HierarchyBounds {
  const merged = finalizeBounds(n.bounds);
  if (merged && isValidBounds(merged)) {
    return merged;
  }

  const fromPts = boundsFromItemPoints(n.items);
  if (fromPts && isValidBounds(fromPts)) {
    console.log(`[bounds] ${level} fallback from points: ${boundsDebugLabel(n)}`);
    return fromPts;
  }

  if (fromPts && !isValidBounds(fromPts)) {
    const [cx, cy] = centerOfDegenerateBounds(fromPts);
    console.log(`[bounds] ${level} micro-bounds created: ${boundsDebugLabel(n)}`);
    return padMicroBoundsFromCenter(cx, cy, level);
  }

  if (merged && !isValidBounds(merged)) {
    const [cx, cy] = centerOfDegenerateBounds(merged);
    console.log(`[bounds] ${level} micro-bounds created: ${boundsDebugLabel(n)}`);
    return padMicroBoundsFromCenter(cx, cy, level);
  }

  for (const it of n.items) {
    const pc = parsePropertyCoords(it);
    if (pc) {
      console.log(`[bounds] ${level} micro-bounds created: ${boundsDebugLabel(n)}`);
      return padMicroBoundsFromCenter(pc.lng, pc.lat, level);
    }
  }

  console.log(`[bounds] ${level} micro-bounds created: ${boundsDebugLabel(n)}`);
  return padMicroBoundsFromCenter(35, 39, level);
}

function freezeRecord<T extends object>(o: Record<string, T>): Readonly<Record<string, T>> {
  return Object.freeze({ ...o }) as Readonly<Record<string, T>>;
}

/** buildHierarchyIndex içi — hashString (dosya sonu) buradan erişilemez; yerel FNV-1a. */
function localHash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Kardeş düğüm sayıları çok yakınsa (demo/eşit dağılım) sıfır-toplam sapma uygula. */
function siblingCountsLookSimilar(values: number[]): boolean {
  if (values.length < 2) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === 0) return false;
  return max === min || max - min <= Math.max(1, Math.floor(max * 0.07));
}

/**
 * Toplamı koruyan deterministik tamsayı sapması (kardeşler arası); mahalle yaprak sayılarına dokunmaz.
 */
function siblingZeroSumJitter(keys: string[], base: number[], parentSeed: string): number[] {
  const n = keys.length;
  if (n !== base.length || n < 2) return [...base];
  const sum = base.reduce((a, b) => a + b, 0);
  if (sum === 0 || !siblingCountsLookSimilar(base)) return [...base];

  const cap = Math.max(1, Math.min(6, Math.floor(sum / Math.max(10, n * 2))));
  const deltas = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const h = localHash32(`${parentSeed}|${keys[i]}`);
    deltas[i] = (h % (cap * 2 + 1)) - cap;
  }
  deltas[n - 1] = -deltas.slice(0, n - 1).reduce((a, b) => a + b, 0);

  let next = base.map((v, i) => v + deltas[i]);
  for (let iter = 0; iter < n * 6; iter++) {
    const neg = next.findIndex((x) => x < 0);
    if (neg < 0) break;
    const pos = next.findIndex((x) => x > 0);
    if (pos < 0) return [...base];
    next[neg] += 1;
    next[pos] -= 1;
  }
  if (next.some((x) => x < 0)) return [...base];

  let s2 = next.reduce((a, b) => a + b, 0);
  const drift = sum - s2;
  if (drift !== 0) {
    let bi = 0;
    for (let i = 1; i < n; i++) if (next[i]! > next[bi]!) bi = i;
    next[bi] = (next[bi] ?? 0) + drift;
    if ((next[bi] ?? 0) < 0) return [...base];
  }
  return next;
}

/**
 * Tüm property listesi için tek geçişte hierarchy indeksi.
 * useMemo(() => buildHierarchyIndex(items), [items]) ile bir kez üretilmelidir.
 */
export function buildHierarchyIndex(
  properties: readonly MapItem[],
  options?: BuildHierarchyIndexOptions
): HierarchyIndex {
  const getPoly = options?.getPolygonBounds;
  const distGeoOpt = options?.distGeo;

  const regions = new Map<string, MutableNode>();
  const cities = new Map<string, MutableNode>();
  const districts = new Map<string, MutableNode>();
  const neighborhoods = new Map<string, MutableNode>();
  const parcels = new Map<string, MutableNode>();

  const allItems: MapItem[] = [];

  const ensure = (m: Map<string, MutableNode>, key: string, name: string, parentKeys: string[]): MutableNode => {
    let n = m.get(key);
    if (!n) {
      n = {
        key,
        name,
        parentKeys: [...parentKeys],
        items: [],
        bounds: createEmptyBounds(),
        childKeys: new Set<string>(),
      };
      m.set(key, n);
    }
    return n;
  };

  for (const raw of properties) {
    const base = normalizeMapItemGeographyForKeys(raw);
    const c = parsePropertyCoords(base);
    const item: MapItem = c
      ? { ...base, latitude: c.lat, longitude: c.lng }
      : { ...base, latitude: Number.NaN, longitude: Number.NaN };

    allItems.push(item);

    const regionName = getItemRegionName(item);
    const regionKey = hierarchyKeyFromString(regionName);
    const cityKey = cityKeyForItem(item);
    const districtKey = districtKeyForItem(item);
    const neighborhoodKey = neighborhoodKeyForItem(item);
    const parcelKey = `parcel:${stableMapItemId(item)}`;

    const rNode = ensure(regions, regionKey, regionName, []);
    const cityNode = ensure(cities, cityKey, String(item.city ?? "").trim() || cityKey, [regionKey]);
    const distNode = ensure(districts, districtKey, String(item.district ?? "").trim() || districtKey, [
      regionKey,
      cityKey,
    ]);
    const neighNode = ensure(neighborhoods, neighborhoodKey, String(item.neighborhood ?? "").trim() || neighborhoodKey, [
      regionKey,
      cityKey,
      districtKey,
    ]);

    const addCoords = (node: MutableNode) => {
      node.items.push(item);
      const poly = getPoly?.(item);
      if (poly && isValidBounds(poly)) {
        extendBoundsFromBox(node.bounds, poly);
      } else if (c) {
        extendBounds(node.bounds, c.lng, c.lat);
      }
    };

    addCoords(rNode);
    addCoords(cityNode);
    addCoords(distNode);
    addCoords(neighNode);

    if (!parcels.has(parcelKey)) {
      const pN: MutableNode = {
        key: parcelKey,
        name: String(item.title ?? "").trim() || parcelKey,
        parentKeys: [regionKey, cityKey, districtKey, neighborhoodKey],
        items: [item],
        bounds: createEmptyBounds(),
        childKeys: new Set<string>(),
      };
      const poly = getPoly?.(item);
      if (poly && isValidBounds(poly)) {
        extendBoundsFromBox(pN.bounds, poly);
      } else if (c) {
        extendBounds(pN.bounds, c.lng, c.lat);
      }
      parcels.set(parcelKey, pN);
    }
  }

  for (const [pk, pn] of parcels) {
    const nk = pn.parentKeys[3];
    if (nk) neighborhoods.get(nk)?.childKeys.add(pk);
  }
  for (const [nk, nn] of neighborhoods) {
    const dk = nn.parentKeys[2];
    if (dk) districts.get(dk)?.childKeys.add(nk);
  }
  for (const [dk, dn] of districts) {
    const ck = dn.parentKeys[1];
    if (ck) cities.get(ck)?.childKeys.add(dk);
  }
  for (const [ck, cn] of cities) {
    const rk = cn.parentKeys[0];
    if (rk) regions.get(rk)?.childKeys.add(ck);
  }

  /** Leaf = gerçek ilan adedi; üst seviyeler = alt child node sayımlarının toplamı (çift sayım yok). */
  const countNeighborhood = new Map<string, number>();
  for (const [k, v] of neighborhoods) {
    countNeighborhood.set(k, v.items.length);
  }
  const countDistrict = new Map<string, number>();
  for (const [k, v] of districts) {
    let s = 0;
    for (const nk of v.childKeys) s += countNeighborhood.get(nk) ?? 0;
    countDistrict.set(k, s > 0 ? s : v.items.length);
  }
  const countCity = new Map<string, number>();
  for (const [k, v] of cities) {
    let s = 0;
    for (const dk of v.childKeys) s += countDistrict.get(dk) ?? 0;
    countCity.set(k, s > 0 ? s : v.items.length);
  }
  const countRegion = new Map<string, number>();
  for (const [k, v] of regions) {
    let s = 0;
    for (const ck of v.childKeys) s += countCity.get(ck) ?? 0;
    countRegion.set(k, s > 0 ? s : v.items.length);
  }

  /** Üst seviyeler: kardeşlerde çok benzer sayılarda toplamı koruyan görüntü sapması (mahalle = gerçek adet, dokunulmaz). */
  const displayDistrict = new Map<string, number>(countDistrict);
  for (const cn of cities.values()) {
    const dks = [...cn.childKeys].sort();
    if (dks.length < 2) continue;
    const base = dks.map((dk) => countDistrict.get(dk) ?? 0);
    const jittered = siblingZeroSumJitter(dks, base, cn.key);
    dks.forEach((dk, i) => displayDistrict.set(dk, jittered[i]!));
  }

  const displayCity = new Map<string, number>(countCity);
  for (const rn of regions.values()) {
    const cks = [...rn.childKeys].sort();
    if (cks.length < 2) continue;
    const base = cks.map((ck) => countCity.get(ck) ?? 0);
    const jittered = siblingZeroSumJitter(cks, base, rn.key);
    cks.forEach((ck, i) => displayCity.set(ck, jittered[i]!));
  }

  const displayRegion = new Map<string, number>(countRegion);
  const regionKeysSorted = [...regions.keys()].sort();
  if (regionKeysSorted.length >= 2) {
    const base = regionKeysSorted.map((rk) => countRegion.get(rk) ?? 0);
    const jittered = siblingZeroSumJitter(regionKeysSorted, base, "tr-regions");
    regionKeysSorted.forEach((rk, i) => displayRegion.set(rk, jittered[i]!));
  }

  const finalizeNode = (
    n: MutableNode,
    level: "region" | "city" | "district" | "neighborhood" | "parcel",
    countOverride?: number
  ): HierarchyRegionNode | HierarchyCityNode | HierarchyDistrictNode | HierarchyNeighborhoodNode | HierarchyParcelNode => {
    const b =
      level === "district"
        ? ensureDistrictOrNeighborhoodBounds(n, "district")
        : level === "neighborhood"
          ? ensureDistrictOrNeighborhoodBounds(n, "neighborhood")
          : finalizeBounds(n.bounds);
    let center = getBoundsCenter(b);
    if (!center && n.items.length > 0) {
      const pc = parsePropertyCoords(n.items[0]!);
      if (pc) center = [pc.lng, pc.lat];
    }
    const childKeys = Array.from(n.childKeys).sort();
    const itemsFrozen = Object.freeze(n.items.slice()) as readonly MapItem[];

    const resolvedCount =
      countOverride !== undefined
        ? countOverride
        : level === "parcel"
          ? 1
          : n.items.length;
    const base = {
      key: n.key,
      name: n.name,
      parentKeys: Object.freeze([...n.parentKeys]) as readonly string[],
      count: resolvedCount,
      center,
      bounds: b,
      childKeys: Object.freeze(childKeys) as readonly string[],
      items: itemsFrozen,
      level,
    };

    if (level === "parcel") {
      return Object.freeze({
        ...base,
        level: "parcel" as const,
        count: 1,
        childKeys: Object.freeze([]) as readonly [],
      }) as HierarchyParcelNode;
    }
    return Object.freeze(base) as
      | HierarchyRegionNode
      | HierarchyCityNode
      | HierarchyDistrictNode
      | HierarchyNeighborhoodNode;
  };

  const regionsByKey: Record<string, HierarchyRegionNode> = {};
  for (const [k, v] of regions) {
    regionsByKey[k] = finalizeNode(v, "region", displayRegion.get(k) ?? countRegion.get(k)) as HierarchyRegionNode;
  }

  const citiesByKey: Record<string, HierarchyCityNode> = {};
  for (const [k, v] of cities) {
    citiesByKey[k] = finalizeNode(v, "city", displayCity.get(k) ?? countCity.get(k)) as HierarchyCityNode;
  }

  const districtsByKey: Record<string, HierarchyDistrictNode> = {};
  for (const [k, v] of districts) {
    districtsByKey[k] = finalizeNode(v, "district", displayDistrict.get(k) ?? countDistrict.get(k)) as HierarchyDistrictNode;
  }

  const neighborhoodsByKey: Record<string, HierarchyNeighborhoodNode> = {};
  for (const [k, v] of neighborhoods) neighborhoodsByKey[k] = finalizeNode(v, "neighborhood", countNeighborhood.get(k)) as HierarchyNeighborhoodNode;

  const parcelsByKey: Record<string, HierarchyParcelNode> = {};
  for (const [k, v] of parcels) parcelsByKey[k] = finalizeNode(v, "parcel") as HierarchyParcelNode;

  if (process.env.NODE_ENV === "development") {
    let nCity = 0;
    for (const c of Object.values(citiesByKey)) {
      if (nCity++ < 10) {
        console.log("[COUNT TRACE REAL]", { level: "city", key: c.key, name: c.name, count: c.count });
      }
    }
    const sample = Object.values(citiesByKey)[0];
    if (sample) {
      let nDist = 0;
      for (const dk of sample.childKeys) {
        const d = districtsByKey[dk];
        if (d && nDist++ < 10) {
          console.log("[COUNT TRACE REAL]", { level: "district", key: d.key, name: d.name, count: d.count });
        }
      }
    }
    let nNh = 0;
    for (const n of Object.values(neighborhoodsByKey)) {
      if (nNh++ < 8) {
        console.log("[COUNT TRACE REAL]", { level: "neighborhood", key: n.key, name: n.name, count: n.count });
      }
    }
    for (const r of Object.values(regionsByKey)) {
      console.log("[COUNT TRACE REAL]", { level: "region", key: r.key, name: r.name, count: r.count });
    }
  }

  const coordOutsideParentByItemId = new Set<string>();
  const ixSnapshot: HierarchyIndex = {
    regionsByKey: freezeRecord(regionsByKey),
    citiesByKey: freezeRecord(citiesByKey),
    districtsByKey: freezeRecord(districtsByKey),
    neighborhoodsByKey: freezeRecord(neighborhoodsByKey),
    parcelsByKey: freezeRecord(parcelsByKey),
    allItems: Object.freeze(allItems) as readonly MapItem[],
    coordOutsideParentByItemId,
  };

  for (const [pk, parcel] of Object.entries(parcelsByKey)) {
    const it = parcel.items[0];
    const rk = hierarchyKeyFromString(getItemRegionName(it));
    const exp = [rk, cityKeyForItem(it), districtKeyForItem(it), neighborhoodKeyForItem(it)];
    const got = [...parcel.parentKeys];
    if (exp.length !== got.length || exp.some((v, i) => v !== got[i])) {
      console.warn(`[coords] parent chain mismatch for parcel ${pk}`, { expected: exp, got });
    }
  }

  for (const it of allItems) {
    if (!parsePropertyCoords(it)) continue;
    const poly =
      distGeoOpt && distGeoOpt.features?.length
        ? findDistrictPolygonFeatureIndexed(distGeoOpt, it.city, String(it.district ?? ""))
        : null;
    if (!validateRealCoordsAgainstParents(it, ixSnapshot, poly)) {
      coordOutsideParentByItemId.add(stableMapItemId(it));
    }
  }

  return Object.freeze({
    regionsByKey: freezeRecord(regionsByKey),
    citiesByKey: freezeRecord(citiesByKey),
    districtsByKey: freezeRecord(districtsByKey),
    neighborhoodsByKey: freezeRecord(neighborhoodsByKey),
    parcelsByKey: freezeRecord(parcelsByKey),
    allItems: Object.freeze(allItems) as readonly MapItem[],
    coordOutsideParentByItemId: coordOutsideParentByItemId as ReadonlySet<string>,
  });
}

/** Seçim yoluna göre önceden hesaplanmış item listesi (filter yerine O(1) map lookup) */
export function getHierarchyItems(
  ix: HierarchyIndex,
  pickedRegion: string,
  pickedCity: string,
  pickedDistrict: string,
  pickedNeighborhood: string
): MapItem[] {
  if (pickedNeighborhood) {
    const nk = neighborhoodKeyFromParts(pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood);
    const list = ix.neighborhoodsByKey[nk]?.items;
    if (list?.length) return [...list];
  }
  if (pickedDistrict) {
    const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
    const list = ix.districtsByKey[dk]?.items;
    if (list?.length) return [...list];
  }
  if (pickedCity) {
    const ck = lookupCityKey(pickedRegion, pickedCity);
    const list = ix.citiesByKey[ck]?.items;
    if (list?.length) return [...list];
  }
  if (pickedRegion) {
    const rk = hierarchyKeyFromString(pickedRegion);
    const list = ix.regionsByKey[rk]?.items;
    if (list?.length) return [...list];
  }
  return [...ix.allItems];
}

export function lookupCityKey(pickedRegion: string, pickedCity: string): string {
  const rk = hierarchyKeyFromString(pickedRegion);
  const ck = hierarchyKeyFromString(pickedCity);
  if (!pickedRegion.trim() || isTurkeyRegionName(pickedRegion)) return ck;
  return `${rk}:${ck}`;
}

export function districtKeyFromParts(
  pickedRegion: string,
  pickedCity: string,
  pickedDistrict: string
): string {
  return `${lookupCityKey(pickedRegion, pickedCity)}:${hierarchyKeyFromString(pickedDistrict)}`;
}

export function neighborhoodKeyFromParts(
  pickedRegion: string,
  pickedCity: string,
  pickedDistrict: string,
  pickedNeighborhood: string
): string {
  return `${districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict)}:${hierarchyKeyFromString(pickedNeighborhood)}`;
}

/**
 * Parsel seviyesi item listesi.
 * Seçili mahalle varken **yalnızca** o mahallenin child parcel key’leri (ilçe/şehir fallback yok).
 * Mahalle yokken ilçe → şehir fallback.
 */
export function getParcelItemsFromHierarchy(
  ix: HierarchyIndex,
  pickedCity: string,
  pickedDistrict: string,
  pickedNeighborhood: string,
  pickedRegion: string
): MapItem[] {
  const preferParsed = (list: MapItem[]) => list.map((it) => mapItemWithParsedCoords(it) ?? it);

  if (pickedNeighborhood.trim()) {
    const nk = neighborhoodKeyFromParts(pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood);
    return preferParsed(getParcelItemsFromNeighborhoodChildren(ix, nk));
  }

  const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
  const byD = ix.districtsByKey[dk]?.items;
  const wD = preferParsed(byD ? [...byD] : []);
  if (wD.length > 0) return wD;

  const ck = lookupCityKey(pickedRegion, pickedCity);
  const byC = ix.citiesByKey[ck]?.items;
  return preferParsed(byC ? [...byC] : []);
}

/**
 * Parsel görünümünde koordinat üretiminde hangi parent bounds’ın esas alındığı (debug).
 */
export function getParcelViewParentBoundsSource(
  ix: HierarchyIndex,
  pickedRegion: string,
  pickedCity: string,
  pickedDistrict: string,
  pickedNeighborhood: string
): "neighborhood" | "district" | "city" {
  if (!pickedNeighborhood.trim()) {
    const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
    const d = ix.districtsByKey[dk];
    if (d?.bounds && isValidBounds(d.bounds)) return "district";
    const ck = lookupCityKey(pickedRegion, pickedCity);
    const c = ix.citiesByKey[ck];
    if (c?.bounds && isValidBounds(c.bounds)) return "city";
    return "district";
  }

  const nk = neighborhoodKeyFromParts(pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood);
  const n = ix.neighborhoodsByKey[nk];
  if (n?.bounds && isValidBounds(n.bounds)) return "neighborhood";
  const fromPts = boundsFromItemPoints(n?.items ?? []);
  if (fromPts && isValidBounds(fromPts)) return "neighborhood";

  const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
  const d = ix.districtsByKey[dk];
  if (d?.bounds && isValidBounds(d.bounds)) return "district";
  const ck = lookupCityKey(pickedRegion, pickedCity);
  const c = ix.citiesByKey[ck];
  if (c?.bounds && isValidBounds(c.bounds)) return "city";
  return "district";
}

/** Mahalle child parcel key’leri üzerinden (cache); boşsa mahalle node items */
export function getParcelItemsFromNeighborhoodChildren(ix: HierarchyIndex, neighborhoodKey: string): MapItem[] {
  const n = ix.neighborhoodsByKey[neighborhoodKey];
  if (!n) return [];
  const out: MapItem[] = [];
  for (const pk of n.childKeys) {
    const p = ix.parcelsByKey[pk];
    if (p?.items[0]) out.push(p.items[0]);
  }
  if (out.length > 0) return out;
  return n.items.map(mapItemWithParsedCoords).filter((it): it is MapItem => it !== null);
}

export function buildProvinceCountsFromIndex(ix: HierarchyIndex, pickedRegion: string): Map<string, number> {
  const m = new Map<string, number>();
  const rpk = pickedRegion.trim() ? hierarchyKeyFromString(pickedRegion) : "";
  for (const city of Object.values(ix.citiesByKey)) {
    if (rpk && city.parentKeys[0] !== rpk) continue;
    const k = normTR(city.name);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + city.count);
  }
  return m;
}

export function buildRegionCentersFromIndex(ix: HierarchyIndex): FeatureCollection<Point, CountPointProps> {
  const regions = Object.values(ix.regionsByKey).sort((a, b) => regionSort(a.name, b.name));
  const rawFeatures = regions.map((region) => {
    const center = region.center;
    if (!center || region.count === 0) return null;
    const feature: Feature<Point, CountPointProps> = {
      type: "Feature",
      id: `cnt_region_${normTR(region.name)}`,
      properties: {
        id: `cnt_region_${normTR(region.name)}`,
        name: region.name,
        region: region.name,
        count: region.count,
        level: "region",
      },
      geometry: { type: "Point", coordinates: center },
    };
    return feature;
  });
  const features = rawFeatures.filter((f): f is Feature<Point, CountPointProps> => f !== null);
  return { type: "FeatureCollection", features };
}

export function buildDistrictCentersFromIndex(
  ix: HierarchyIndex,
  pickedCity: string,
  pickedRegion: string
): FeatureCollection<Point, CountPointProps> {
  if (!pickedCity.trim()) return { type: "FeatureCollection", features: [] };
  const ck = lookupCityKey(pickedRegion, pickedCity);
  const rpk = pickedRegion.trim() ? hierarchyKeyFromString(pickedRegion) : "";

  const features: Feature<Point, CountPointProps>[] = [];
  for (const d of Object.values(ix.districtsByKey)) {
    if (d.parentKeys[1] !== ck) continue;
    if (rpk && d.parentKeys[0] !== rpk) continue;
    const center = d.center;
    if (!center || d.count === 0) continue;
    features.push({
      type: "Feature",
      id: `cnt_d_${ck}_${d.key}`,
      properties: {
        id: `cnt_d_${ck}_${d.key}`,
        name: d.name,
        district: d.name,
        city: pickedCity,
        count: d.count,
        level: "district",
      },
      geometry: { type: "Point", coordinates: center },
    });
  }
  return { type: "FeatureCollection", features };
}

export function buildNeighborhoodCentersFromIndex(
  ix: HierarchyIndex,
  pickedCity: string,
  pickedDistrict: string,
  pickedRegion: string
): FeatureCollection<Point, CountPointProps> {
  if (!pickedCity.trim() || !pickedDistrict.trim()) return { type: "FeatureCollection", features: [] };
  const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);

  const out: Feature<Point, CountPointProps>[] = [];
  for (const n of Object.values(ix.neighborhoodsByKey)) {
    if (n.parentKeys[2] !== dk) continue;
    const center = n.center;
    if (!center || n.count === 0) continue;
    out.push({
      type: "Feature",
      id: `cnt_n_${n.key}`,
      properties: {
        id: `cnt_n_${n.key}`,
        name: n.name,
        district: pickedDistrict,
        city: pickedCity,
        neighborhood: n.name,
        count: n.count,
        level: "neighborhood",
      },
      geometry: { type: "Point", coordinates: center },
    });
  }
  if (out.length > 0) {
    return { type: "FeatureCollection", features: out };
  }

  const dist = ix.districtsByKey[dk];
  const fallbackList = dist?.items ? [...dist.items] : [];
  const c = centroidFromItems(fallbackList);
  if (!c || fallbackList.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `cnt_n_all_${dk}`,
        properties: {
          id: `cnt_n_all_${dk}`,
          name: "Tümü",
          district: pickedDistrict,
          city: pickedCity,
          neighborhood: "__ALL__",
          count: fallbackList.length,
          level: "neighborhood",
        },
        geometry: { type: "Point", coordinates: c },
      },
    ],
  };
}

export function sameMapCity(a: unknown, b: unknown): boolean {
  return normalizeText(a) === normalizeText(b);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j] + 1, dp[i]![j - 1] + 1, dp[i - 1]![j - 1] + cost);
    }
  }
  return dp[m]![n]!;
}

export function sameMapDistrict(a: unknown, b: unknown): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return na === nb;
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  const lv = levenshtein(na, nb);
  const m = Math.max(na.length, nb.length, 1);
  if (lv <= 2) return true;
  if (lv / m <= 0.38) return true;
  return false;
}

export function sameMapNeighborhood(a: unknown, b: unknown): boolean {
  return normalizeText(a) === normalizeText(b);
}

export function findMapItemByCityDistrictTitle(list: MapItem[], props: Record<string, unknown>): MapItem | null {
  const rawCity = props.city;
  const rawDist = props.district;
  const rawTitle = props.title;
  const hasCity = rawCity != null && String(rawCity).trim() !== "";
  const hasTitle = rawTitle != null && String(rawTitle).trim() !== "";
  const hasDist = rawDist != null && String(rawDist).trim() !== "";
  if (!hasCity && !hasTitle && !hasDist) return null;
  if (hasCity && !hasTitle && !hasDist) return null;
  return (
    list.find((it) => {
      if (hasCity && !sameMapCity(it.city, rawCity)) return false;
      if (hasDist && !sameMapDistrict(it.district, rawDist)) return false;
      if (hasTitle && normalizeText(it.title) !== normalizeText(rawTitle)) return false;
      return true;
    }) ?? null
  );
}

function coordsFromGeometry(geom: { coordinates?: unknown } | null): number[][] {
  if (!geom) return [];
  const out: number[][] = [];

  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      out.push([Number(node[0]), Number(node[1])]);
      return;
    }
    for (const child of node) walk(child);
  };

  walk((geom as { coordinates?: unknown }).coordinates);
  return out;
}

export function bboxFromGeometry(geom: { coordinates?: unknown } | null) {
  const pts = coordsFromGeometry(geom as { coordinates?: unknown });
  if (!pts.length) return null;

  let minLng = pts[0][0];
  let minLat = pts[0][1];
  let maxLng = pts[0][0];
  let maxLat = pts[0][1];

  for (const [lng, lat] of pts) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLng, minLat, maxLng, maxLat };
}

export function centroidFromGeometry(geom: { coordinates?: unknown } | null): [number, number] | null {
  const pts = coordsFromGeometry(geom as { coordinates?: unknown });
  if (!pts.length) return null;

  let sx = 0;
  let sy = 0;
  let n = 0;

  for (const [lng, lat] of pts) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    sx += lng;
    sy += lat;
    n += 1;
  }

  if (!n) return null;
  return [sx / n, sy / n];
}

function centroidFromItems(list: MapItem[]): [number, number] | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const x of list) {
    const c = parsePropertyCoords(x);
    if (!c) continue;
    sx += c.lng;
    sy += c.lat;
    n += 1;
  }
  if (!n) return null;
  return [sx / n, sy / n];
}

export function findDistrictFeatureRobust(fc: FeatureCollection, city: string, district: string): Feature | null {
  const features = (fc.features || []) as Feature[];
  const wantC = normalizeText(city);
  const wantD = normalizeText(district);
  if (!wantC || !wantD) return null;

  for (const f of features) {
    const p = f.properties as Record<string, unknown> | undefined;
    const c = normalizeText(p?.city || p?.NAME_1);
    const d = normalizeText(p?.district || p?.NAME_2 || p?.name);
    if (c === wantC && d === wantD) return f;
  }

  const inCity = features.filter((f) => {
    const p = f.properties as Record<string, unknown> | undefined;
    return normalizeText(p?.city || p?.NAME_1) === wantC;
  });

  for (const f of inCity) {
    const p = f.properties as Record<string, unknown> | undefined;
    const d = normalizeText(p?.district || p?.NAME_2 || p?.name);
    if (!d) continue;
    if (wantD.length >= 3 && d.length >= 3 && (wantD.includes(d) || d.includes(wantD))) {
      return f;
    }
  }

  let bestFeat: Feature | null = null;
  let bestLv = Infinity;
  for (const f of inCity) {
    const p = f.properties as Record<string, unknown> | undefined;
    const d = normalizeText(p?.district || p?.NAME_2 || p?.name);
    if (!d) continue;
    const lv = levenshtein(wantD, d);
    if (lv < bestLv) {
      bestLv = lv;
      bestFeat = f;
    }
  }
  const maxL = Math.max(wantD.length, 1);
  if (bestFeat && (bestLv <= 3 || bestLv / maxL <= 0.42)) return bestFeat;

  return null;
}

export function getRegionName(cityRaw: string) {
  const city = normTR(cityRaw);

  const marmara = [
    "istanbul",
    "edirne",
    "kirklareli",
    "tekirdag",
    "kocaeli",
    "sakarya",
    "yalova",
    "bursa",
    "balikesir",
    "canakkale",
    "bilecik",
  ];
  const ege = ["izmir", "manisa", "aydin", "mugla", "denizli", "usak", "kutahya", "afyonkarahisar"];
  const akdeniz = ["antalya", "burdur", "isparta", "mersin", "adana", "hatay", "osmaniye", "kahramanmaras"];
  const icAnadolu = [
    "ankara",
    "eskisehir",
    "konya",
    "aksaray",
    "karaman",
    "kirsehir",
    "nevsehir",
    "nigde",
    "kayseri",
    "sivas",
    "yozgat",
    "cankiri",
  ];
  const karadeniz = [
    "samsun",
    "ordu",
    "giresun",
    "trabzon",
    "rize",
    "artvin",
    "gumushane",
    "tokat",
    "amasya",
    "corum",
    "sinop",
    "kastamonu",
    "zonguldak",
    "karabuk",
    "duzce",
    "bolu",
    "bartin",
  ];
  const dogu = [
    "erzurum",
    "erzincan",
    "kars",
    "igdir",
    "agri",
    "ardahan",
    "mus",
    "bingol",
    "tunceli",
    "malatya",
    "elazig",
    "van",
    "bitlis",
    "hakkari",
  ];
  const guneydogu = ["gaziantep", "sanliurfa", "diyarbakir", "mardin", "batman", "siirt", "sirnak", "adiyaman", "kilis"];

  if (marmara.includes(city)) return "Marmara";
  if (ege.includes(city)) return "Ege";
  if (akdeniz.includes(city)) return "Akdeniz";
  if (icAnadolu.includes(city)) return "İç Anadolu";
  if (karadeniz.includes(city)) return "Karadeniz";
  if (dogu.includes(city)) return "Doğu Anadolu";
  if (guneydogu.includes(city)) return "Güneydoğu Anadolu";
  return "Diğer";
}

function normLoc(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getGlobalRegionName(countryOrCity: string): string {
  const loc = normLoc(countryOrCity);
  if (!loc) return "Global";

  const gulf = [
    "uae",
    "united arab emirates",
    "dubai",
    "abu dhabi",
    "qatar",
    "doha",
    "saudi",
    "saudi arabia",
    "riyadh",
    "jeddah",
    "oman",
    "bahrain",
    "kuwait",
    "sharjah",
    "ajman",
  ];
  const usa = [
    "usa",
    "united states",
    "us",
    "america",
    "canada",
    "mexico",
    "new york",
    "los angeles",
    "miami",
    "toronto",
    "vancouver",
  ];
  const russiaCis = [
    "russia",
    "russian federation",
    "moscow",
    "belarus",
    "kazakhstan",
    "ukraine",
    "uzbekistan",
    "armenia",
    "azerbaijan",
    "georgia",
    "kyrgyzstan",
    "tajikistan",
    "turkmenistan",
  ];
  const avrupa = [
    "united kingdom",
    "uk",
    "england",
    "germany",
    "france",
    "spain",
    "italy",
    "netherlands",
    "switzerland",
    "austria",
    "belgium",
    "portugal",
    "ireland",
    "greece",
  ];

  if (gulf.some((x) => loc.includes(x))) return "Körfez";
  if (usa.some((x) => loc.includes(x))) return "ABD";
  if (russiaCis.some((x) => loc.includes(x))) return "Rusya & CIS";
  if (avrupa.some((x) => loc.includes(x))) return "Avrupa";
  return "Global";
}

export function getItemRegionName(item: MapItem): string {
  const country = safeStr(item.country).trim();
  const isTurkey =
    !country ||
    normTR(country) === "turkiye" ||
    normTR(country) === "türkiye" ||
    normTR(country) === "turkey";
  if (isTurkey) return getRegionName(item.city);
  return getGlobalRegionName(country || item.city);
}

export function regionSort(a: string, b: string) {
  const order = [
    "Marmara",
    "Ege",
    "Akdeniz",
    "İç Anadolu",
    "Karadeniz",
    "Doğu Anadolu",
    "Güneydoğu Anadolu",
    "Diğer",
    "Körfez",
    "ABD",
    "Rusya & CIS",
    "Avrupa",
    "Global",
  ];
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i !== -1 && j !== -1) return i - j;
  if (i !== -1) return -1;
  if (j !== -1) return 1;
  return a.localeCompare(b);
}

export function haversineKm(a: [number, number], b: [number, number]) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(aa));
}

export function nearestItemToLngLat(list: MapItem[], lng: number, lat: number): MapItem | null {
  if (!list.length) return null;

  let best: MapItem | null = null;
  let bestDist = Infinity;

  for (const it of list) {
    const c = parsePropertyCoords(it);
    if (!c) continue;
    const d = haversineKm([lng, lat], [c.lng, c.lat]);
    if (d < bestDist) {
      bestDist = d;
      best = { ...it, latitude: c.lat, longitude: c.lng };
    }
  }

  return best;
}

export function isTurkeyRegionName(name: string): boolean {
  return (TURKEY_REGIONS as readonly string[]).includes(name);
}

export function buildRegionCentersFC(mergedItems: MapItem[]): FeatureCollection<Point, CountPointProps> {
  const regions = Array.from(new Set(mergedItems.map((x) => getItemRegionName(x)))).sort(regionSort);

  const rawFeatures = regions.map((region) => {
    const list = mergedItems.filter((x) => getItemRegionName(x) === region);
    const center = centroidFromItems(list);
    if (!center || list.length === 0) return null;

    const feature: Feature<Point, CountPointProps> = {
      type: "Feature",
      id: `cnt_region_${normTR(region)}`,
      properties: {
        id: `cnt_region_${normTR(region)}`,
        name: region,
        region,
        count: list.length,
        level: "region",
      },
      geometry: {
        type: "Point",
        coordinates: center,
      },
    };

    return feature;
  });

  const features = rawFeatures.filter((f): f is Feature<Point, CountPointProps> => f !== null);

  return {
    type: "FeatureCollection",
    features,
  };
}

export function buildProvinceCounts(mergedItems: MapItem[], pickedRegion: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of mergedItems) {
    if (pickedRegion && getItemRegionName(it) !== pickedRegion) continue;
    const k = normTR(it.city);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function buildGlobalCityCentersFC(
  mergedItems: MapItem[],
  pickedRegion: string
): FeatureCollection<Point, CountPointProps> {
  if (!pickedRegion || isTurkeyRegionName(pickedRegion)) {
    return { type: "FeatureCollection", features: [] };
  }
  const regionItems = mergedItems.filter((x) => getItemRegionName(x) === pickedRegion);
  const m = new Map<string, { nameRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();
  for (const it of regionItems) {
    const key = normTR(it.city || it.country || "");
    if (!key) continue;
    if (!Number.isFinite(it.latitude) || !Number.isFinite(it.longitude)) continue;
    const cur = m.get(key) ?? {
      nameRaw: (it.city || it.country || "").trim() || "Other",
      count: 0,
      sumLng: 0,
      sumLat: 0,
      n: 0,
    };
    if (cur.n === 0) cur.nameRaw = (it.city || it.country || "").trim() || "Other";
    cur.count += 1;
    cur.sumLng += Number(it.longitude);
    cur.sumLat += Number(it.latitude);
    cur.n += 1;
    m.set(key, cur);
  }
  const features: Feature<Point, CountPointProps>[] = Array.from(m.entries()).map(([k, v]) => ({
    type: "Feature",
    id: `cnt_global_city_${normTR(pickedRegion)}_${k}`,
    properties: {
      id: `cnt_global_city_${normTR(pickedRegion)}_${k}`,
      name: v.nameRaw,
      city: v.nameRaw,
      count: v.count,
      level: "city" as const,
    },
    geometry: {
      type: "Point",
      coordinates: [v.sumLng / v.n, v.sumLat / v.n],
    },
  }));
  return { type: "FeatureCollection", features };
}

export function buildDistrictCentersFC(mergedItems: MapItem[], pickedCity: string): FeatureCollection<Point, CountPointProps> {
  if (!pickedCity) return { type: "FeatureCollection", features: [] };

  const cityK = normalizeText(pickedCity);
  const m = new Map<string, { districtRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();

  for (const it of mergedItems) {
    if (normalizeText(it.city) !== cityK) continue;
    const dRaw = (it.district ?? "").trim();
    const dK = normalizeText(dRaw);
    if (!dK) continue;
    if (!Number.isFinite(it.latitude) || !Number.isFinite(it.longitude)) continue;

    const cur = m.get(dK) ?? { districtRaw: dRaw, count: 0, sumLng: 0, sumLat: 0, n: 0 };
    cur.count += 1;
    cur.sumLng += Number(it.longitude);
    cur.sumLat += Number(it.latitude);
    cur.n += 1;
    m.set(dK, cur);
  }

  const features: Feature<Point, CountPointProps>[] = Array.from(m.entries()).map(([k, v]) => ({
    type: "Feature",
    id: `cnt_d_${cityK}_${k}`,
    properties: {
      id: `cnt_d_${cityK}_${k}`,
      name: v.districtRaw,
      district: v.districtRaw,
      city: pickedCity,
      count: v.count,
      level: "district",
    },
    geometry: {
      type: "Point",
      coordinates: [v.sumLng / v.n, v.sumLat / v.n],
    },
  }));

  return { type: "FeatureCollection", features };
}

export function buildNeighborhoodCentersFC(
  mergedItems: MapItem[],
  pickedCity: string,
  pickedDistrict: string
): FeatureCollection<Point, CountPointProps> {
  if (!pickedCity || !pickedDistrict) return { type: "FeatureCollection", features: [] };

  const cityK = normalizeText(pickedCity);
  const distK = normalizeText(pickedDistrict);
  const m = new Map<string, { neighborhoodRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();

  for (const it of mergedItems) {
    if (normalizeText(it.city) !== cityK) continue;
    if (!sameMapDistrict(it.district, pickedDistrict)) continue;

    const nRaw = (it.neighborhood ?? "").trim();
    const nKey = normalizeText(nRaw);
    if (!nKey) continue;
    if (!Number.isFinite(it.latitude) || !Number.isFinite(it.longitude)) continue;

    const cur = m.get(nKey) ?? { neighborhoodRaw: nRaw, count: 0, sumLng: 0, sumLat: 0, n: 0 };
    cur.count += 1;
    cur.sumLng += Number(it.longitude);
    cur.sumLat += Number(it.latitude);
    cur.n += 1;
    m.set(nKey, cur);
  }

  const features: Feature<Point, CountPointProps>[] = Array.from(m.entries()).map(([k, v]) => ({
    type: "Feature",
    id: `cnt_n_${cityK}_${distK}_${k}`,
    properties: {
      id: `cnt_n_${cityK}_${distK}_${k}`,
      name: v.neighborhoodRaw,
      district: pickedDistrict,
      city: pickedCity,
      neighborhood: v.neighborhoodRaw,
      count: v.count,
      level: "neighborhood",
    },
    geometry: {
      type: "Point",
      coordinates: [v.sumLng / v.n, v.sumLat / v.n],
    },
  }));

  if (features.length > 0) {
    return { type: "FeatureCollection", features };
  }

  const fallbackList = mergedItems.filter(
    (it) =>
      normalizeText(it.city) === cityK &&
      sameMapDistrict(it.district, pickedDistrict) &&
      Number.isFinite(it.latitude) &&
      Number.isFinite(it.longitude)
  );
  const c = centroidFromItems(fallbackList);
  if (!c || fallbackList.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `cnt_n_all_${cityK}_${distK}`,
        properties: {
          id: `cnt_n_all_${cityK}_${distK}`,
          name: "Tümü",
          district: pickedDistrict,
          city: pickedCity,
          neighborhood: "__ALL__",
          count: fallbackList.length,
          level: "neighborhood",
        },
        geometry: { type: "Point", coordinates: c },
      },
    ],
  };
}

export function buildActiveProvinceGeo(provGeo: FeatureCollection, pickedRegion: string): FeatureCollection {
  if (!pickedRegion) return provGeo;
  return {
    type: "FeatureCollection",
    features: (provGeo.features || []).filter((f) => safeStr((f as Feature).properties?.region) === pickedRegion),
  };
}

export function buildActiveDistrictGeo(
  distGeo: FeatureCollection,
  pickedCity: string,
  pickedDistrict: string,
  level: MapLevel
): FeatureCollection {
  if (!pickedCity) return { type: "FeatureCollection", features: [] };

  let features = (distGeo.features || []).filter((f) =>
    sameMapCity(safeStr((f as Feature).properties?.city) || safeStr((f as Feature).properties?.NAME_1), pickedCity)
  );
  if (level === "neighborhood" && pickedDistrict) {
    features = features.filter((f) =>
      sameMapDistrict(safeStr((f as Feature).properties?.district) || safeStr((f as Feature).properties?.NAME_2), pickedDistrict)
    );
  }

  return { type: "FeatureCollection", features };
}

export function buildParcelFocusGeo(
  level: MapLevel,
  activeDistrictGeo: FeatureCollection,
  pickedDistrict: string
): FeatureCollection<Polygon> {
  if (level !== "parcel") return { type: "FeatureCollection", features: [] };

  const districtGeom = activeDistrictGeo.features.find((f) =>
    sameMapDistrict(safeStr((f as Feature).properties?.district) || safeStr((f as Feature).properties?.NAME_2), pickedDistrict)
  )?.geometry;
  if (!districtGeom) return { type: "FeatureCollection", features: [] };

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: `focus_dist_${normTR(pickedDistrict)}`,
        properties: { id: `focus_dist_${normTR(pickedDistrict)}`, name: pickedDistrict },
        geometry: districtGeom as Polygon,
      },
    ],
  };
}

export function buildPointsGeo(pointsMapItems: MapItem[]): FeatureCollection<Point> {
  const dup = new Map<string, number>();
  return {
    type: "FeatureCollection",
    features: pointsMapItems.map((p) => {
      const fid = stableMapItemId(p);
      const propId = String(p.propertyId ?? p.id ?? fid).trim();
      const lng = p.longitude;
      const lat = p.latitude;
      const key = `${lng.toFixed(6)}_${lat.toFixed(6)}`;
      const n = dup.get(key) ?? 0;
      dup.set(key, n + 1);
      const eps = 0.00012;
      const lngAdj = lng + n * eps;
      const latAdj = lat + n * eps;
      return {
        type: "Feature" as const,
        id: fid,
        geometry: {
          type: "Point" as const,
          coordinates: [lngAdj, latAdj],
        },
        properties: {
          id: fid,
          propertyId: propId,
          title: p.title ?? "",
          city: p.city ?? "",
          district: p.district ?? "",
          neighborhood: p.neighborhood ?? "",
          _origLng: lng,
          _origLat: lat,
        },
      };
    }),
  };
}

export function buildSelectedGeo(selected: MapViewSelected | null | undefined): FeatureCollection<Point> {
  if (!selected) return { type: "FeatureCollection", features: [] };
  const c = parsePropertyCoords(selected as unknown as MapItem);
  if (!c) return { type: "FeatureCollection", features: [] };

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: selected.id,
        geometry: {
          type: "Point",
          coordinates: [c.lng, c.lat],
        },
        properties: {
          id: selected.id,
        },
      },
    ],
  };
}

/** Parsel sentetik dağılım — alan ve N’ye göre alt/üst sınır (derece) */
const SPACING_MIN_DEG = 0.00014;
const SPACING_MAX_DEG = 0.016;
/** Polygon bbox kenarından içeri — örnekleme taşmasın */
const BBOX_INSET = 0.9;
/** Mahalle sentetik fallback: ilçe merkezine göre tek noktaya çökme yerine küçük yerel kutu */
const NH_MICRO_PAD_DEG = 0.004;
const GRID_NEIGHBOR_MAX_RING = 14;
const REJECTION_MAX_ATTEMPTS = 220;
const FINE_SUBGRID = 7;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Parent + parcel için stabil 32-bit seed (aynı girdi → aynı RNG dizisi) */
function seedForParcel(parentKey: string, parcelKey: string, index: number): number {
  return hashString(`${parentKey}::${parcelKey}::${index}`) ^ 0x9e3779b9;
}

function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (Math.imul(t, 1664525) + 1013904223) >>> 0;
    return t / 4294967296;
  };
}

function insetBounds(b: HierarchyBounds, shrink: number): HierarchyBounds {
  const cx = (b.minLng + b.maxLng) / 2;
  const cy = (b.minLat + b.maxLat) / 2;
  const hw = ((b.maxLng - b.minLng) / 2) * shrink;
  const hh = ((b.maxLat - b.minLat) / 2) * shrink;
  return {
    minLng: cx - hw,
    maxLng: cx + hw,
    minLat: cy - hh,
    maxLat: cy + hh,
  };
}

/** Efektif alan ~ π r² benzeri: N ile ortalama aralık (derece) */
function adaptiveMinSpacingDeg(spanLng: number, spanLat: number, n: number): number {
  const area = Math.max(spanLng * spanLat, 1e-15);
  const spacing = Math.sqrt(area / (Math.PI * Math.max(n, 1))) * 0.92;
  return Math.max(SPACING_MIN_DEG, Math.min(SPACING_MAX_DEG, spacing));
}

/** Küçük mahalle → sık grid; büyük alan → geniş hücre (yoğunluğu yayar) */
function gridDimensions(n: number, spanLng: number, spanLat: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  const aspect = spanLng / Math.max(spanLat, 1e-9);
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * Math.max(aspect, 0.2)))));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, rows };
}

/** Parsel dağılımı: en az N hücre, hafif fazlalıkla çakışmayı azaltır. */
function gridDimensionsForParcelSpread(n: number, spanLng: number, spanLat: number): { cols: number; rows: number } {
  if (n <= 0) return { cols: 1, rows: 1 };
  const targetCells = Math.max(n, Math.ceil(n * 1.2));
  const aspect = spanLng / Math.max(spanLat, 1e-9);
  const cols = Math.max(1, Math.min(targetCells, Math.ceil(Math.sqrt(targetCells * Math.max(aspect, 0.25)))));
  const rows = Math.max(1, Math.ceil(targetCells / cols));
  return { cols, rows };
}

function minDistanceOk(pt: [number, number], placed: ReadonlyArray<[number, number]>, minDeg: number): boolean {
  const [lng, lat] = pt;
  for (const [pLng, pLat] of placed) {
    const dx = (lng - pLng) * Math.cos((lat * Math.PI) / 180);
    const dy = lat - pLat;
    if (Math.hypot(dx, dy) < minDeg) return false;
  }
  return true;
}

function uvToLngLat(b: HierarchyBounds, u: number, v: number): [number, number] {
  const lng = b.minLng + u * (b.maxLng - b.minLng);
  const lat = b.minLat + v * (b.maxLat - b.minLat);
  return [lng, lat];
}

/** Sentetik nokta seçili parent (ilçe poligonu + opsiyonel mahalle poligonu + mahalle bounds) içinde mi? */
function pointInResolvedParent(
  lng: number,
  lat: number,
  districtClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBoundsStrict: HierarchyBounds | null
): boolean {
  const pt = point([lng, lat]);
  if (districtClip && !booleanPointInPolygon(pt, districtClip)) return false;
  if (neighborhoodClip && !booleanPointInPolygon(pt, neighborhoodClip)) return false;
  if (
    neighborhoodBoundsStrict &&
    isValidBounds(neighborhoodBoundsStrict) &&
    !pointInBoundsH(neighborhoodBoundsStrict, lng, lat)
  ) {
    return false;
  }
  return true;
}

function isParcelSynthCandidateValid(
  lng: number,
  lat: number,
  districtPolyFeature: Feature<Polygon | MultiPolygon> | null,
  neighborhoodPoly: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBounds: HierarchyBounds | null,
  placed: ReadonlyArray<[number, number]>,
  minDeg: number
): boolean {
  if (!pointInResolvedParent(lng, lat, districtPolyFeature, neighborhoodPoly, neighborhoodBounds)) return false;
  return minDistanceOk([lng, lat], placed, minDeg);
}

/**
 * Örnek alanı: mahalle poligonu → mahalle bounds → ilçe poligonu → ilçe bounds → micro.
 */
function resolveParcelParentForGrid(
  nNode: HierarchyNeighborhoodNode,
  districtPolyFeature: Feature<Polygon | MultiPolygon> | null,
  neighborhoodPolyParam: Feature<Polygon | MultiPolygon> | null,
  ix: HierarchyIndex
): {
  sampleBounds: HierarchyBounds;
  districtClip: Feature<Polygon | MultiPolygon> | null;
  neighborhoodClip: Feature<Polygon | MultiPolygon> | null;
  neighborhoodBoundsStrict: HierarchyBounds | null;
  sourceLabel: string;
} {
  const neighborhoodBoundsRaw = nNode.bounds && isValidBounds(nNode.bounds) ? nNode.bounds : null;
  const dk = nNode.parentKeys[2];
  const distNode = dk ? ix.districtsByKey[dk] : null;
  const districtBounds =
    distNode?.bounds && isValidBounds(distNode.bounds) ? distNode.bounds : null;

  if (neighborhoodPolyParam) {
    const bb = bbox(neighborhoodPolyParam);
    return {
      sampleBounds: insetBounds(
        { minLng: bb[0], minLat: bb[1], maxLng: bb[2], maxLat: bb[3] },
        BBOX_INSET
      ),
      districtClip: districtPolyFeature,
      neighborhoodClip: neighborhoodPolyParam,
      neighborhoodBoundsStrict: neighborhoodBoundsRaw,
      sourceLabel: "neighborhood polygon",
    };
  }
  if (neighborhoodBoundsRaw) {
    return {
      sampleBounds: insetBounds(neighborhoodBoundsRaw, BBOX_INSET),
      districtClip: districtPolyFeature,
      neighborhoodClip: null,
      neighborhoodBoundsStrict: neighborhoodBoundsRaw,
      sourceLabel: "neighborhood bounds",
    };
  }
  if (districtPolyFeature) {
    const bb = bbox(districtPolyFeature);
    return {
      sampleBounds: insetBounds(
        { minLng: bb[0], minLat: bb[1], maxLng: bb[2], maxLat: bb[3] },
        BBOX_INSET
      ),
      districtClip: districtPolyFeature,
      neighborhoodClip: null,
      neighborhoodBoundsStrict: null,
      sourceLabel: "district polygon",
    };
  }
  if (districtBounds) {
    return {
      sampleBounds: insetBounds(districtBounds, BBOX_INSET),
      districtClip: null,
      neighborhoodClip: null,
      neighborhoodBoundsStrict: null,
      sourceLabel: "district bounds",
    };
  }
  const eff = getEffectiveNeighborhoodParcelBounds(nNode, districtPolyFeature);
  return {
    sampleBounds: eff,
    districtClip: districtPolyFeature,
    neighborhoodClip: null,
    neighborhoodBoundsStrict: neighborhoodBoundsRaw,
    sourceLabel: "micro",
  };
}

function cellCenterWithJitter(
  col: number,
  row: number,
  cols: number,
  rows: number,
  sampleBounds: HierarchyBounds,
  seed: number
): [number, number] {
  const rng = makeRng(seed ^ 0xcafebabe);
  const ju = ((rng() - 0.5) * 0.58) / Math.max(cols, 1);
  const jv = ((rng() - 0.5) * 0.58) / Math.max(rows, 1);
  const u = Math.min(0.999, Math.max(0.001, (col + 0.5 + ju) / cols));
  const v = Math.min(0.999, Math.max(0.001, (row + 0.5 + jv) / rows));
  return uvToLngLat(sampleBounds, u, v);
}

function trySyntheticFromGridAndNeighbors(
  primaryCol: number,
  primaryRow: number,
  cols: number,
  rows: number,
  sampleBounds: HierarchyBounds,
  districtClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBoundsStrict: HierarchyBounds | null,
  placed: ReadonlyArray<[number, number]>,
  minDeg: number,
  seed: number,
  stats: { minDistRetry: number }
): [number, number] | null {
  const tryMin = (m: number): [number, number] | null => {
    const tryCell = (cc: number, rr: number, s: number): [number, number] | null => {
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) return null;
      const [lng, lat] = cellCenterWithJitter(cc, rr, cols, rows, sampleBounds, s);
      if (!pointInResolvedParent(lng, lat, districtClip, neighborhoodClip, neighborhoodBoundsStrict)) {
        return null;
      }
      if (minDistanceOk([lng, lat], placed, m)) return [lng, lat];
      return null;
    };

    let p = tryCell(primaryCol, primaryRow, seed);
    if (p) return p;

    for (let ring = 1; ring <= GRID_NEIGHBOR_MAX_RING; ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          p = tryCell(primaryCol + dc, primaryRow + dr, seed ^ (ring * 0x9e3779b1) ^ (dc * 2246822519) ^ (dr * 3266489917));
          if (p) return p;
        }
      }
    }
    return null;
  };

  let r = tryMin(minDeg);
  if (r) return r;
  stats.minDistRetry += 1;
  r = tryMin(minDeg * 0.72);
  if (r) return r;
  r = tryMin(minDeg * 0.52);
  return r;
}

function fineSubgridFallback(
  primaryCol: number,
  primaryRow: number,
  cols: number,
  rows: number,
  sampleBounds: HierarchyBounds,
  districtClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBoundsStrict: HierarchyBounds | null,
  placed: ReadonlyArray<[number, number]>,
  minDeg: number,
  seed: number
): [number, number] | null {
  const spanLng = sampleBounds.maxLng - sampleBounds.minLng;
  const spanLat = sampleBounds.maxLat - sampleBounds.minLat;

  for (let a = 0; a < FINE_SUBGRID; a++) {
    for (let b = 0; b < FINE_SUBGRID; b++) {
      const rng = makeRng(seed ^ (a * 524287) ^ (b * 131071));
      const u =
        (primaryCol + (a + 0.45 + rng() * 0.1) / FINE_SUBGRID) / Math.max(cols, 1);
      const v =
        (primaryRow + (b + 0.45 + rng() * 0.1) / FINE_SUBGRID) / Math.max(rows, 1);
      const uu = Math.min(0.999, Math.max(0.001, u));
      const vv = Math.min(0.999, Math.max(0.001, v));
      const lng = sampleBounds.minLng + uu * spanLng;
      const lat = sampleBounds.minLat + vv * spanLat;
      if (
        pointInResolvedParent(lng, lat, districtClip, neighborhoodClip, neighborhoodBoundsStrict) &&
        minDistanceOk([lng, lat], placed, minDeg * 0.5)
      ) {
        return [lng, lat];
      }
    }
  }
  return null;
}

/** Parent içinde geçerli en yakın nokta; salt ile tarama başlangıcı değişir (aynı köşeye çökme önlenir). */
function nearestValidInParent(
  lng0: number,
  lat0: number,
  districtClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodClip: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBoundsStrict: HierarchyBounds | null,
  sampleBounds: HierarchyBounds,
  salt: string
): [number, number] {
  let best: [number, number] = [lng0, lat0];
  let bestD = Infinity;
  const spanLng = sampleBounds.maxLng - sampleBounds.minLng;
  const spanLat = sampleBounds.maxLat - sampleBounds.minLat;
  const steps = 11;
  const h = hashString(salt);
  const offI = h % (steps + 1);
  const offJ = (h >>> 8) % (steps + 1);
  for (let di = 0; di <= steps; di++) {
    for (let dj = 0; dj <= steps; dj++) {
      const i = (di + offI) % (steps + 1);
      const j = (dj + offJ) % (steps + 1);
      const lng = sampleBounds.minLng + (i / steps) * spanLng;
      const lat = sampleBounds.minLat + (j / steps) * spanLat;
      if (!pointInResolvedParent(lng, lat, districtClip, neighborhoodClip, neighborhoodBoundsStrict)) continue;
      const d = Math.abs(lng - lng0) + Math.abs(lat - lat0);
      if (d < bestD) {
        bestD = d;
        best = [lng, lat];
      }
    }
  }
  const nudgeLng = (((h >>> 16) % 17) - 8) * 1.2e-5;
  const nudgeLat = (((h >>> 20) % 17) - 8) * 1.2e-5;
  const cand: [number, number] = [best[0]! + nudgeLng, best[1]! + nudgeLat];
  if (pointInResolvedParent(cand[0], cand[1], districtClip, neighborhoodClip, neighborhoodBoundsStrict)) {
    return cand;
  }
  return best;
}

/**
 * Mahalle parsel örnekleme kutusu: parent dışına genişletme yok.
 * Öncelik: node bounds → items bounds → merkez + micro pad → ilçe poligonu bbox içinde dar kutu (şehir fallback yok).
 */
function getEffectiveNeighborhoodParcelBounds(
  nNode: HierarchyNeighborhoodNode,
  districtPolyFeature: Feature<Polygon | MultiPolygon> | null
): HierarchyBounds {
  if (nNode.bounds && isValidBounds(nNode.bounds)) {
    return insetBounds(nNode.bounds, BBOX_INSET);
  }
  const fromPts = boundsFromItemPoints(nNode.items);
  if (fromPts && isValidBounds(fromPts)) {
    return insetBounds(fromPts, BBOX_INSET);
  }
  const c = nNode.center;
  if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
    return expandCenterToBounds(c, NH_MICRO_PAD_DEG);
  }
  if (districtPolyFeature) {
    const bb = bbox(districtPolyFeature);
    const cx = (bb[0] + bb[2]) / 2;
    const cy = (bb[1] + bb[3]) / 2;
    return expandCenterToBounds([cx, cy], NEIGHBORHOOD_PAD_LNG * 0.35);
  }
  return expandCenterToBounds([32.85, 39.92], 0.002);
}

function validateParcelRealCoordsForDisplay(
  lng: number,
  lat: number,
  districtPoly: Feature<Polygon | MultiPolygon> | null,
  neighborhoodPoly: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBoundsStrict: HierarchyBounds | null,
  itemId: string
): boolean {
  const pt = point([lng, lat]);
  if (districtPoly && !booleanPointInPolygon(pt, districtPoly)) {
    console.log("[PARCEL COORD REJECT]", {
      itemId,
      lng,
      lat,
      reason: "outside_district_polygon",
    });
    return false;
  }
  if (neighborhoodPoly && !booleanPointInPolygon(pt, neighborhoodPoly)) {
    console.log("[PARCEL COORD REJECT]", {
      itemId,
      lng,
      lat,
      reason: "outside_neighborhood_polygon",
    });
    return false;
  }
  if (
    neighborhoodBoundsStrict &&
    isValidBounds(neighborhoodBoundsStrict) &&
    !pointInBoundsH(neighborhoodBoundsStrict, lng, lat)
  ) {
    console.log("[PARCEL COORD REJECT]", {
      itemId,
      lng,
      lat,
      reason: "outside_neighborhood_bounds",
    });
    return false;
  }
  return true;
}

function sampleParcelPointByRejection(
  districtPoly: Feature<Polygon | MultiPolygon> | null,
  neighborhoodPoly: Feature<Polygon | MultiPolygon> | null,
  neighborhoodBoundsStrict: HierarchyBounds | null,
  sampleBounds: HierarchyBounds | null,
  placed: ReadonlyArray<[number, number]>,
  minDeg: number,
  seed: number,
  maxAttempts = REJECTION_MAX_ATTEMPTS
): [number, number] | null {
  const rng = makeRng(seed ^ 0x50f1ce);
  const rect = sampleBounds && isValidBounds(sampleBounds) ? sampleBounds : null;
  if (neighborhoodPoly) {
    const bb = bbox(neighborhoodPoly);
    for (let k = 0; k < maxAttempts; k++) {
      const lng = bb[0] + rng() * (bb[2] - bb[0]);
      const lat = bb[1] + rng() * (bb[3] - bb[1]);
      if (
        isParcelSynthCandidateValid(
          lng,
          lat,
          districtPoly,
          neighborhoodPoly,
          neighborhoodBoundsStrict,
          placed,
          minDeg * 0.88
        )
      ) {
        return [lng, lat];
      }
    }
    return null;
  }
  if (rect) {
    for (let k = 0; k < maxAttempts; k++) {
      const lng = rect.minLng + rng() * (rect.maxLng - rect.minLng);
      const lat = rect.minLat + rng() * (rect.maxLat - rect.minLat);
      if (
        isParcelSynthCandidateValid(
          lng,
          lat,
          districtPoly,
          null,
          neighborhoodBoundsStrict,
          placed,
          minDeg * 0.88
        )
      ) {
        return [lng, lat];
      }
    }
  }
  return null;
}

/**
 * İlçe GeoJSON’undan (GADM2) ilçe polygon’unu bulur — parsel noktalarının kara sınırı içinde kalması için.
 */
export function findDistrictPolygonFeature(
  distGeo: FeatureCollection,
  cityName: string,
  districtName: string
): Feature<Polygon | MultiPolygon> | null {
  const feats = distGeo.features || [];
  for (const f of feats) {
    const p = f.properties as Record<string, unknown> | undefined;
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    if (!sameMapCity(safeStr(p?.city) || safeStr(p?.NAME_1), cityName)) continue;
    if (!sameMapDistrict(safeStr(p?.district) || safeStr(p?.NAME_2) || safeStr(p?.name), districtName)) continue;
    return f as Feature<Polygon | MultiPolygon>;
  }
  return null;
}

type DistrictPolygonIndex = {
  exactByKey: Map<string, Feature<Polygon | MultiPolygon>>;
  byCity: Map<string, Feature<Polygon | MultiPolygon>[]>;
};

const districtPolygonIndexCache = new WeakMap<FeatureCollection, DistrictPolygonIndex>();

/**
 * findDistrictPolygonFeature ~6800 ilan × ~900 ilçe polygonunu her ilan için baştan
 * tarıyordu (Levenshtein dahil) — bu O(N×M) tarama tek başına 10 saniyeyi buluyordu.
 * Aynı distGeo referansı için index bir kez kurulur (WeakMap'te tutulur), sonrasında
 * çoğu ilan tam eşleşmeyle O(1) bulunur; yalnızca eşleşmeyenler kendi ili içindeki
 * (tüm ülke değil) adaylarla eski bulanık (fuzzy) mantıkla karşılaştırılır.
 */
function getDistrictPolygonIndex(distGeo: FeatureCollection): DistrictPolygonIndex {
  const cached = districtPolygonIndexCache.get(distGeo);
  if (cached) return cached;

  const exactByKey = new Map<string, Feature<Polygon | MultiPolygon>>();
  const byCity = new Map<string, Feature<Polygon | MultiPolygon>[]>();

  for (const f of distGeo.features || []) {
    const p = f.properties as Record<string, unknown> | undefined;
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    const feat = f as Feature<Polygon | MultiPolygon>;

    const cityNorm = normalizeText(safeStr(p?.city) || safeStr(p?.NAME_1));
    const districtNorm = normalizeText(safeStr(p?.district) || safeStr(p?.NAME_2) || safeStr(p?.name));

    const exactKey = `${cityNorm}|${districtNorm}`;
    if (!exactByKey.has(exactKey)) exactByKey.set(exactKey, feat);

    const list = byCity.get(cityNorm);
    if (list) list.push(feat);
    else byCity.set(cityNorm, [feat]);
  }

  const index: DistrictPolygonIndex = { exactByKey, byCity };
  districtPolygonIndexCache.set(distGeo, index);
  return index;
}

function findDistrictPolygonFeatureIndexed(
  distGeo: FeatureCollection,
  cityName: string,
  districtName: string
): Feature<Polygon | MultiPolygon> | null {
  if (!distGeo.features?.length) return null;
  const index = getDistrictPolygonIndex(distGeo);

  const cityNorm = normalizeText(cityName);
  const districtNorm = normalizeText(districtName);
  const exact = index.exactByKey.get(`${cityNorm}|${districtNorm}`);
  if (exact) return exact;

  const candidates = index.byCity.get(cityNorm);
  if (!candidates) return null;
  for (const f of candidates) {
    const p = f.properties as Record<string, unknown> | undefined;
    if (!sameMapDistrict(safeStr(p?.district) || safeStr(p?.NAME_2) || safeStr(p?.name), districtName)) continue;
    return f;
  }
  return null;
}

/**
 * GADM3 veya benzeri mahalle poligonu (NAME_3 / neighborhood) — dosyada yoksa null.
 */
export function findNeighborhoodPolygonFeature(
  distGeo: FeatureCollection,
  cityName: string,
  districtName: string,
  neighborhoodName: string
): Feature<Polygon | MultiPolygon> | null {
  const nNorm = normalizeText(neighborhoodName);
  if (!nNorm) return null;
  const feats = distGeo.features || [];
  for (const f of feats) {
    const p = f.properties as Record<string, unknown> | undefined;
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    if (!sameMapCity(safeStr(p?.city) || safeStr(p?.NAME_1), cityName)) continue;
    if (!sameMapDistrict(safeStr(p?.district) || safeStr(p?.NAME_2) || safeStr(p?.name), districtName)) continue;
    const nh =
      safeStr(p?.NAME_3) ||
      safeStr(p?.NAME_4) ||
      safeStr(p?.neighborhood) ||
      safeStr(p?.mahalle) ||
      safeStr(p?.NL_NAME_3);
    if (nh && normalizeText(nh) === nNorm) {
      return f as Feature<Polygon | MultiPolygon>;
    }
  }
  return null;
}

export type ComputeParcelCentersParams = {
  ix: HierarchyIndex;
  neighborhoodKey: string;
  districtPolygon: Feature<Polygon | MultiPolygon> | null;
  /** Gelecekte mahalle poligonu (GADM3 vb.) — varsa sentetik/real öncelik bu alanla kilitlenir */
  neighborhoodPolygon?: Feature<Polygon | MultiPolygon> | null;
  /** İsteğe bağlı: sentetik noktalar için minimum mesafe tabanı (derece) */
  minDistanceDeg?: number;
};

/**
 * Mahalle içi parsel harita noktaları:
 * - Gerçek koordinat: parent poligon/bounds ile uyumluysa kullanılır.
 * - Sentetik: bbox üzerinde √N×√N hücre grid’i, hücre merkezi + jitter, komşu hücre taraması, min mesafe, rejection + nearest fallback.
 */
export function computeParcelDisplayCentersForNeighborhood(
  params: ComputeParcelCentersParams
): Readonly<Record<string, [number, number]>> {
  const { ix, neighborhoodKey, districtPolygon } = params;
  const neighborhoodPolyIn =
    params.neighborhoodPolygon &&
    (params.neighborhoodPolygon.geometry.type === "Polygon" ||
      params.neighborhoodPolygon.geometry.type === "MultiPolygon")
      ? params.neighborhoodPolygon
      : null;

  const nNode = ix.neighborhoodsByKey[neighborhoodKey];
  if (!nNode) return {};

  const districtPolyFeature =
    districtPolygon &&
    (districtPolygon.geometry.type === "Polygon" || districtPolygon.geometry.type === "MultiPolygon")
      ? districtPolygon
      : null;

  const neighborhoodBoundsRaw = nNode.bounds && isValidBounds(nNode.bounds) ? nNode.bounds : null;

  const resolved = resolveParcelParentForGrid(nNode, districtPolyFeature, neighborhoodPolyIn, ix);

  const sortedKeys = [...nNode.childKeys].sort((a, b) => a.localeCompare(b));
  const N = sortedKeys.length;
  if (N === 0) return {};

  const spanLng = Math.max(resolved.sampleBounds.maxLng - resolved.sampleBounds.minLng, 1e-12);
  const spanLat = Math.max(resolved.sampleBounds.maxLat - resolved.sampleBounds.minLat, 1e-12);
  const minDegSynth =
    params.minDistanceDeg ?? adaptiveMinSpacingDeg(spanLng, spanLat, Math.max(N, 1));

  const { cols, rows } = gridDimensionsForParcelSpread(N, spanLng, spanLat);
  const gridStats = { minDistRetry: 0 };

  let rejectedReal = 0;
  let nFine = 0;
  let nRejection = 0;
  let nNearest = 0;

  const placed: [number, number][] = [];
  const out: Record<string, [number, number]> = {};

  for (let i = 0; i < sortedKeys.length; i++) {
    const pk = sortedKeys[i]!;
    const parcel = ix.parcelsByKey[pk];
    if (!parcel?.items[0]) continue;
    const item = parcel.items[0];
    const nkItem = neighborhoodKeyForItem(item);
    if (nkItem !== neighborhoodKey) {
      console.warn(
        `[parcel] wrong parent assignment ${pk} — expected neighborhoodKey "${neighborhoodKey}" got "${nkItem}" (normalized)`
      );
    }

    const itemId = stableMapItemId(item);
    const real = parsePropertyCoords(item);
    if (real) {
      const ok = validateParcelRealCoordsForDisplay(
        real.lng,
        real.lat,
        districtPolyFeature,
        neighborhoodPolyIn,
        neighborhoodBoundsRaw,
        itemId
      );
      if (ok) {
        const c: [number, number] = [real.lng, real.lat];
        out[pk] = c;
        placed.push(c);
        continue;
      }
      rejectedReal += 1;
    }

    const seed = seedForParcel(neighborhoodKey, pk, i);
    const col = i % cols;
    const row = Math.floor(i / cols);

    let found = trySyntheticFromGridAndNeighbors(
      col,
      row,
      cols,
      rows,
      resolved.sampleBounds,
      resolved.districtClip,
      resolved.neighborhoodClip,
      resolved.neighborhoodBoundsStrict,
      placed,
      minDegSynth,
      seed,
      gridStats
    );

    if (!found) {
      found = fineSubgridFallback(
        col,
        row,
        cols,
        rows,
        resolved.sampleBounds,
        resolved.districtClip,
        resolved.neighborhoodClip,
        resolved.neighborhoodBoundsStrict,
        placed,
        minDegSynth,
        seed
      );
      if (found) nFine += 1;
    }

    if (!found) {
      found = sampleParcelPointByRejection(
        resolved.districtClip,
        resolved.neighborhoodClip,
        resolved.neighborhoodBoundsStrict,
        resolved.sampleBounds,
        placed,
        minDegSynth,
        seed,
        REJECTION_MAX_ATTEMPTS
      );
      if (found) nRejection += 1;
    }

    if (!found) {
      const [lng0, lat0] = cellCenterWithJitter(col, row, cols, rows, resolved.sampleBounds, seed);
      found = nearestValidInParent(
        lng0,
        lat0,
        resolved.districtClip,
        resolved.neighborhoodClip,
        resolved.neighborhoodBoundsStrict,
        resolved.sampleBounds,
        `${pk}|${neighborhoodKey}`
      );
      nNearest += 1;
      if (!minDistanceOk(found, placed, minDegSynth * 0.38)) {
        gridStats.minDistRetry += 1;
      }
    }

    out[pk] = found;
    placed.push(found);
  }

  const accepted = Object.keys(out).length;
  console.log("[PARCEL GRID]", {
    neighborhoodKey,
    total: N,
    accepted,
    rejected: rejectedReal,
    source: resolved.sourceLabel,
    cells: `${cols}×${rows}`,
    fallbackNearest: nNearest,
    fallbackFine: nFine,
    fallbackRejection: nRejection,
  });
  return out;
}

/**
 * Parsel seviyesi: mahalle child parcel key’leri → nokta; yoksa ilçe altı mahalleler → parseller; en sonda ilçe items.
 */
function buildParcelMarkersFromHierarchy(
  ix: HierarchyIndex,
  pickedRegion: string,
  pickedCity: string,
  pickedDistrict: string,
  pickedNeighborhood: string,
  distGeo: FeatureCollection | null | undefined
): FeatureCollection<Point, CountPointProps> {
  const features: Feature<Point, CountPointProps>[] = [];

  const pushFromItemAt = (it: MapItem, coord: [number, number]) => {
    const pid = String(it.id ?? "").trim();
    if (!pid) return;
    features.push({
      type: "Feature",
      id: `parcel_feat_${pid}`,
      properties: {
        id: pid,
        name: String(it.title ?? "").trim() || pid,
        city: it.city,
        district: it.district ?? "",
        neighborhood: it.neighborhood ?? "",
        count: 1,
        level: "parcel",
      },
      geometry: { type: "Point", coordinates: coord },
    });
  };

  if (pickedNeighborhood.trim()) {
    const nk = neighborhoodKeyFromParts(pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood);
    const n = ix.neighborhoodsByKey[nk];
    const distFeat =
      distGeo && pickedCity.trim() && pickedDistrict.trim()
        ? findDistrictPolygonFeature(distGeo, pickedCity, pickedDistrict)
        : null;
    const nhPoly =
      distGeo && pickedCity.trim() && pickedDistrict.trim() && pickedNeighborhood.trim()
        ? findNeighborhoodPolygonFeature(distGeo, pickedCity, pickedDistrict, pickedNeighborhood)
        : null;
    const centerMap = n
      ? computeParcelDisplayCentersForNeighborhood({
          ix,
          neighborhoodKey: nk,
          districtPolygon: distFeat,
          neighborhoodPolygon: nhPoly,
        })
      : {};

    const nbStrict = n && n.bounds && isValidBounds(n.bounds) ? n.bounds : null;
    if (n) {
      for (const pk of n.childKeys) {
        const parcel = ix.parcelsByKey[pk];
        const it = parcel?.items[0];
        if (!it) continue;
        const mapped = centerMap[pk];
        if (mapped) {
          pushFromItemAt(it, mapped);
          continue;
        }
        const pc = parsePropertyCoords(it);
        if (
          pc &&
          validateParcelRealCoordsForDisplay(
            pc.lng,
            pc.lat,
            distFeat,
            nhPoly,
            nbStrict,
            stableMapItemId(it)
          )
        ) {
          pushFromItemAt(it, [pc.lng, pc.lat]);
        }
      }
    }
  }

  /**
   * Parsel görünümünde mahalle seçiliyken yalnızca yukarıdaki dal kullanılır (seçili mahalle childKeys).
   * Mahalle yokken (edge): ilçe altı mahalleleri sırayla dene; en son çare ilçe item’ları — geniş alana “saçma” değil, eksik marker kurtarma.
   */
  if (features.length === 0 && pickedCity.trim() && pickedDistrict.trim() && !pickedNeighborhood.trim()) {
    const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
    const d = ix.districtsByKey[dk];
    if (d) {
      for (const nhk of d.childKeys) {
        const nb = ix.neighborhoodsByKey[nhk];
        if (!nb) continue;
        const distFeat = distGeo ? findDistrictPolygonFeature(distGeo, pickedCity, pickedDistrict) : null;
        const nbStrict = nb.bounds && isValidBounds(nb.bounds) ? nb.bounds : null;
        const nhPolyLoop = distGeo && nb.name.trim()
          ? findNeighborhoodPolygonFeature(distGeo, pickedCity, pickedDistrict, nb.name)
          : null;
        const centerMap = computeParcelDisplayCentersForNeighborhood({
          ix,
          neighborhoodKey: nhk,
          districtPolygon: distFeat,
          neighborhoodPolygon: nhPolyLoop,
        });
        for (const pk of nb.childKeys) {
          const parcel = ix.parcelsByKey[pk];
          const it = parcel?.items[0];
          if (!it) continue;
          const mapped = centerMap[pk];
          if (mapped) {
            pushFromItemAt(it, mapped);
            continue;
          }
          const pc = parsePropertyCoords(it);
          if (
            pc &&
            validateParcelRealCoordsForDisplay(
              pc.lng,
              pc.lat,
              distFeat,
              nhPolyLoop,
              nbStrict,
              stableMapItemId(it)
            )
          ) {
            pushFromItemAt(it, [pc.lng, pc.lat]);
          }
        }
      }
      if (features.length === 0) {
        const distFeat = distGeo ? findDistrictPolygonFeature(distGeo, pickedCity, pickedDistrict) : null;
        for (const it of d.items) {
          const pc = parsePropertyCoords(it);
          if (!pc) continue;
          const nkItem = neighborhoodKeyForItem(it);
          const nbNode = ix.neighborhoodsByKey[nkItem];
          const nbStrict = nbNode?.bounds && isValidBounds(nbNode.bounds) ? nbNode.bounds : null;
          const nhPolyItem =
            distGeo && it.neighborhood?.trim()
              ? findNeighborhoodPolygonFeature(distGeo, pickedCity, pickedDistrict, String(it.neighborhood))
              : null;
          if (
            validateParcelRealCoordsForDisplay(
              pc.lng,
              pc.lat,
              distFeat,
              nhPolyItem,
              nbStrict,
              stableMapItemId(it)
            )
          ) {
            pushFromItemAt(it, [pc.lng, pc.lat]);
          }
        }
      }
    }
  }

  return { type: "FeatureCollection", features };
}

function logCountTraceGeoFromFeatures(level: MapLevel, features: Feature<Point, CountPointProps>[]) {
  if (process.env.NODE_ENV !== "development" || features.length === 0) return;
  for (const f of features.slice(0, 6)) {
    const p = f.properties;
    console.log("[COUNT TRACE REAL]", {
      level: (p?.level as string) ?? level,
      key: String(p?.id ?? ""),
      name: String(p?.name ?? ""),
      count: p?.count,
    });
  }
}

/**
 * Sadece seçili parent’ın child key’lerinden bubble üretir (tüm il listesini taramaz).
 */
export function buildVisibleCountGeoFromHierarchy(params: {
  level: MapLevel;
  ix: HierarchyIndex;
  selectedRegionKey: string;
  selectedCityKey: string;
  selectedDistrictKey: string;
  pickedRegion: string;
  pickedCity: string;
  pickedDistrict: string;
  pickedNeighborhood: string;
  mergedItems: MapItem[];
  /** Parsel noktaları için ilçe polygon’u (GADM2); yoksa yalnızca bounds / spiral fallback */
  distGeo?: FeatureCollection | null;
}): FeatureCollection<Point, CountPointProps> {
  const {
    level,
    ix,
    selectedRegionKey,
    selectedCityKey,
    selectedDistrictKey,
    pickedRegion,
    pickedCity,
    pickedDistrict,
    pickedNeighborhood,
    mergedItems,
    distGeo,
  } = params;

  if (level === "region") {
    const fc = buildRegionCentersFromIndex(ix);
    logCountTraceGeoFromFeatures("region", fc.features as Feature<Point, CountPointProps>[]);
    return fc;
  }

  if (level === "city") {
    if (pickedRegion && !isTurkeyRegionName(pickedRegion)) {
      const gfc = buildGlobalCityCentersFC(mergedItems, pickedRegion);
      logCountTraceGeoFromFeatures("city", gfc.features as Feature<Point, CountPointProps>[]);
      return gfc;
    }
    if (!selectedRegionKey) {
      return { type: "FeatureCollection", features: [] };
    }
    const r = ix.regionsByKey[selectedRegionKey];
    if (!r) return { type: "FeatureCollection", features: [] };
    const features: Feature<Point, CountPointProps>[] = [];
    for (const ck of r.childKeys) {
      const city = ix.citiesByKey[ck];
      if (!city || city.count === 0 || !city.center) continue;
      const count = city.count;
      features.push({
        type: "Feature",
        id: `cnt_city_${safeStr(city.key)}`,
        properties: {
          id: `cnt_city_${safeStr(city.key)}`,
          name: city.name,
          city: city.name,
          count,
          level: "city",
        },
        geometry: { type: "Point", coordinates: city.center },
      });
    }
    const cityFeatures = features.filter((f) => Number(f.properties?.count || 0) > 0);
    logCountTraceGeoFromFeatures("city", cityFeatures);
    return {
      type: "FeatureCollection",
      features: cityFeatures,
    };
  }

  if (level === "district") {
    if (!selectedCityKey) return { type: "FeatureCollection", features: [] };
    const city = ix.citiesByKey[selectedCityKey];
    if (!city) return { type: "FeatureCollection", features: [] };
    const features: Feature<Point, CountPointProps>[] = [];
    for (const dk of city.childKeys) {
      const d = ix.districtsByKey[dk];
      if (!d || d.count === 0 || !d.center) continue;
      features.push({
        type: "Feature",
        id: `cnt_d_${d.key}`,
        properties: {
          id: `cnt_d_${d.key}`,
          name: d.name,
          district: d.name,
          city: pickedCity,
          count: d.count,
          level: "district",
        },
        geometry: { type: "Point", coordinates: d.center },
      });
    }
    logCountTraceGeoFromFeatures("district", features);
    return { type: "FeatureCollection", features };
  }

  if (level === "neighborhood") {
    if (!selectedDistrictKey || !pickedCity.trim() || !pickedDistrict.trim()) {
      return { type: "FeatureCollection", features: [] };
    }
    const dist = ix.districtsByKey[selectedDistrictKey];
    if (!dist) return { type: "FeatureCollection", features: [] };
    const out: Feature<Point, CountPointProps>[] = [];
    for (const nk of dist.childKeys) {
      const n = ix.neighborhoodsByKey[nk];
      if (!n || n.count === 0) continue;
      const fromBounds = n.bounds && isValidBounds(n.bounds) ? getBoundsCenter(n.bounds) : null;
      const base = fromBounds ?? n.center;
      if (!base) continue;
      const j = (hashString(nk) % 1000) / 1e6;
      const coords: [number, number] = [base[0] + j, base[1] + j * 0.73];
      out.push({
        type: "Feature",
        id: `cnt_n_${n.key}`,
        properties: {
          id: `cnt_n_${n.key}`,
          name: n.name,
          district: pickedDistrict,
          city: pickedCity,
          neighborhood: n.name,
          count: n.count,
          level: "neighborhood",
        },
        geometry: { type: "Point", coordinates: coords },
      });
    }
    if (out.length > 0) {
      logCountTraceGeoFromFeatures("neighborhood", out);
      return { type: "FeatureCollection", features: out };
    }
    const fallbackList = dist.items ? [...dist.items] : [];
    const c = centroidFromItems(fallbackList);
    if (!c || fallbackList.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    const nhFallbackFeatures: Feature<Point, CountPointProps>[] = [
      {
        type: "Feature",
        id: `cnt_n_all_${selectedDistrictKey}`,
        properties: {
          id: `cnt_n_all_${selectedDistrictKey}`,
          name: "Tümü",
          district: pickedDistrict,
          city: pickedCity,
          neighborhood: "__ALL__",
          count: fallbackList.length,
          level: "neighborhood",
        },
        geometry: { type: "Point", coordinates: c },
      },
    ];
    logCountTraceGeoFromFeatures("neighborhood", nhFallbackFeatures);
    return {
      type: "FeatureCollection",
      features: nhFallbackFeatures,
    };
  }

  if (level === "parcel") {
    if (!pickedCity.trim() || !pickedDistrict.trim()) {
      return { type: "FeatureCollection", features: [] };
    }
    const pm = buildParcelMarkersFromHierarchy(
      ix,
      pickedRegion,
      pickedCity,
      pickedDistrict,
      pickedNeighborhood,
      distGeo ?? null
    );
    logCountTraceGeoFromFeatures("parcel", pm.features as Feature<Point, CountPointProps>[]);
    return pm;
  }

  return { type: "FeatureCollection", features: [] };
}

export function buildCountGeo(params: {
  level: MapLevel;
  regionCenters: FeatureCollection<Point, CountPointProps>;
  activeProvinceGeo: FeatureCollection;
  globalCityCenters: FeatureCollection<Point, CountPointProps>;
  districtCenters: FeatureCollection<Point, CountPointProps>;
  neighborhoodCenters: FeatureCollection<Point, CountPointProps>;
  mergedItems: MapItem[];
  pickedRegion: string;
  hierarchyIndex?: HierarchyIndex | null;
}): FeatureCollection<Point, CountPointProps> {
  const {
    level,
    regionCenters,
    activeProvinceGeo,
    globalCityCenters,
    districtCenters,
    neighborhoodCenters,
    mergedItems,
    pickedRegion,
    hierarchyIndex,
  } = params;

  if (level === "region") return regionCenters;

  if (level === "city") {
    if (pickedRegion && !isTurkeyRegionName(pickedRegion)) {
      return globalCityCenters;
    }
    const rawCityFeatures = (activeProvinceGeo.features || []).map((f) => {
      const feat = f as Feature;
      const name = safeStr(feat.properties?.name) || safeStr(feat.properties?.NAME_1);
      const center = centroidFromGeometry(feat.geometry as { coordinates?: unknown });
      if (!name || !center) return null;

      const cityLookupKey = lookupCityKey(pickedRegion, name);
      const fromIdx = hierarchyIndex?.citiesByKey[cityLookupKey]?.count;
      const fromItems = mergedItems.filter(
        (it) => (!pickedRegion || getItemRegionName(it) === pickedRegion) && sameMapCity(it.city, name)
      ).length;
      const count = fromIdx ?? fromItems;

      const out: Feature<Point, CountPointProps> = {
        type: "Feature",
        id: `cnt_city_${safeStr(feat.properties?.id) || normTR(name)}`,
        properties: {
          id: `cnt_city_${safeStr(feat.properties?.id) || normTR(name)}`,
          name,
          city: name,
          count,
          level: "city",
        },
        geometry: {
          type: "Point",
          coordinates: center,
        },
      };
      return out;
    });
    const features = rawCityFeatures
      .filter((x): x is Feature<Point, CountPointProps> => x !== null)
      .filter((x) => Number(x.properties?.count || 0) > 0);

    return { type: "FeatureCollection", features };
  }

  if (level === "district") return districtCenters;
  if (level === "neighborhood") return neighborhoodCenters;

  return { type: "FeatureCollection", features: [] };
}
