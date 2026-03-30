"use client";

import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, MapRef, NavigationControl, Source } from "react-map-gl/mapbox";

type MapItem = {
  id: string;
  propertyId?: string | null;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  country?: string | null;
  price_per_m2?: number | null;
  total_area_m2?: number;
  available_m2?: number | null;
  sold_m2?: number | null;
  min_buy_m2?: number | null;
  max_buy_m2?: number | null;
  zoning_status?: string | null;
  is_real?: boolean | null;
  listing_status?: string | null;
  listing_description?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  is_verified?: boolean | null;
  ada_no?: string | null;
  parcel_no?: string | null;
};

/** Mapbox: center = [lng, lat] — Türkiye geneli */
const MAP_CENTER_LNG = 35;
const MAP_CENTER_LAT = 39;
const MAP_ZOOM = 5;

/** Geçerli TR arsa aralığı (derece) */
const TR_LAT_MIN = 35;
const TR_LAT_MAX = 43;
const TR_LNG_MIN = 25;
const TR_LNG_MAX = 45;

type PipelineStats = {
  total: number;
  valid: number;
  ignored: number;
  usedFallback: boolean;
};

function parsePropertyCoords(raw: MapItem): { lat: number; lng: number } | null {
  if (raw.latitude == null || raw.longitude == null) return null;
  let lat = Number(raw.latitude);
  let lng = Number(raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  /** Olası lat/lng tersliği: sütunlar karışmışsa düzelt */
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

function mapItemWithParsedCoords(p: MapItem): MapItem | null {
  const c = parsePropertyCoords(p);
  if (!c) return null;
  return { ...p, latitude: c.lat, longitude: c.lng };
}

function buildValidatedItems(incoming: MapItem[]): { list: MapItem[]; stats: PipelineStats } {
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
  /** Veri yoksa sahte ilan gösterme — harita Türkiye merkezinde boş kalır (admin seed ile karışmaz). */
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

/** GeoJSON feature id / promoteId — boş id olmasın */
function stableMapItemId(p: MapItem): string {
  const fromId = String(p.id ?? "").trim();
  if (fromId) return fromId;
  const fromPid = String(p.propertyId ?? "").trim();
  if (fromPid) return fromPid;
  return `ll_${Number(p.latitude).toFixed(6)}_${Number(p.longitude).toFixed(6)}`;
}

function findMapItemByIdLikeInList(list: MapItem[], raw: string | null | undefined): MapItem | null {
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

function findMapItemByCoords(list: MapItem[], lng: number, lat: number, epsDeg = 2e-4): MapItem | null {
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

/** queryRenderedFeatures ile gelen feature’dan id çözümü */
function extractRawPropertyIdFromFeature(f: any): string | null {
  const p = f?.properties;
  if (p?.id != null && String(p.id).trim() !== "") return String(p.id);
  if (p?.propertyId != null && String(p.propertyId).trim() !== "") return String(p.propertyId);
  if (f?.id != null && String(f.id).trim() !== "") return String(f.id);
  return null;
}

function findMapItemByCityDistrictTitle(list: MapItem[], props: Record<string, unknown>): MapItem | null {
  const rawCity = props.city;
  const rawDist = props.district;
  const rawTitle = props.title;
  const hasCity = rawCity != null && String(rawCity).trim() !== "";
  const hasTitle = rawTitle != null && String(rawTitle).trim() !== "";
  const hasDist = rawDist != null && String(rawDist).trim() !== "";
  if (!hasCity && !hasTitle && !hasDist) return null;
  /** Sadece şehir ile eşleşme binlerce kayıt döner — belirsiz, kullanma */
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

type Level = "region" | "city" | "district" | "neighborhood" | "parcel";

type CountPointProps = {
  id: string;
  name: string;
  count: number;
  city?: string;
  district?: string;
  neighborhood?: string;
  region?: string;
  level?: Level;
};

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

function normTR(s: unknown) {
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

function sameTR(a: unknown, b: unknown) {
  return normTR(a) === normTR(b);
}

/** trim + boşluk + yaygın ekler; sonra Türkçe-güvenli küçük harf anahtar */
function normalizeText(s: unknown): string {
  let t = String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(ilçesi|ilçe|belediyesi|merkez|i̇lçesi)\b/gi, "")
    .trim();
  return normTR(t);
}

function sameMapCity(a: unknown, b: unknown): boolean {
  return normalizeText(a) === normalizeText(b);
}

/** Küçük yazım / eksik ek farkları (normalizeText sonrası) */
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

function sameMapDistrict(a: unknown, b: unknown): boolean {
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

function sameMapNeighborhood(a: unknown, b: unknown): boolean {
  return normalizeText(a) === normalizeText(b);
}

function coordsFromGeometry(geom: any): number[][] {
  if (!geom) return [];
  const out: number[][] = [];

  const walk = (node: any) => {
    if (!Array.isArray(node)) return;
    if (node.length >= 2 && typeof node[0] === "number" && typeof node[1] === "number") {
      out.push([Number(node[0]), Number(node[1])]);
      return;
    }
    for (const child of node) walk(child);
  };

  walk(geom.coordinates);
  return out;
}

function bboxFromGeometry(geom: any) {
  const pts = coordsFromGeometry(geom);
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

function centroidFromGeometry(geom: any): [number, number] | null {
  const pts = coordsFromGeometry(geom);
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

/**
 * GADM il/ilçe adları ile haritadan gelen seçim arasında küçük farkları tolere eder.
 * Polygon adı ile property district adı birebir olmasa da bbox/centroid için geometri bulunur.
 */
function findDistrictFeatureRobust(fc: FeatureCollection, city: string, district: string): Feature | null {
  const features = (fc.features || []) as Feature[];
  const wantC = normalizeText(city);
  const wantD = normalizeText(district);
  if (!wantC || !wantD) return null;

  for (const f of features) {
    const p: any = f.properties || {};
    const c = normalizeText(p.city || p.NAME_1);
    const d = normalizeText(p.district || p.NAME_2 || p.name);
    if (c === wantC && d === wantD) return f;
  }

  const inCity = features.filter((f) => {
    const p: any = f.properties || {};
    return normalizeText(p.city || p.NAME_1) === wantC;
  });

  for (const f of inCity) {
    const p: any = f.properties || {};
    const d = normalizeText(p.district || p.NAME_2 || p.name);
    if (!d) continue;
    if (wantD.length >= 3 && d.length >= 3 && (wantD.includes(d) || d.includes(wantD))) {
      return f;
    }
  }

  let bestFeat: Feature | null = null;
  let bestLv = Infinity;
  for (const f of inCity) {
    const p: any = f.properties || {};
    const d = normalizeText(p.district || p.NAME_2 || p.name);
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

function findDistrictFeature(fc: FeatureCollection, city: string, district: string): Feature | null {
  return findDistrictFeatureRobust(fc, city, district);
}

function getRegionName(cityRaw: string) {
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

const TURKEY_REGIONS = ["Marmara", "Ege", "Akdeniz", "İç Anadolu", "Karadeniz", "Doğu Anadolu", "Güneydoğu Anadolu"];

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
    "london",
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

function getItemRegionName(item: MapItem): string {
  const country = safeStr((item as MapItem).country).trim();
  const isTurkey =
    !country ||
    normTR(country) === "turkiye" ||
    normTR(country) === "türkiye" ||
    normTR(country) === "turkey";
  if (isTurkey) return getRegionName(item.city);
  return getGlobalRegionName(country || item.city);
}

function regionSort(a: string, b: string) {
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

function haversineKm(a: [number, number], b: [number, number]) {
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

function nearestItemToLngLat(list: MapItem[], lng: number, lat: number): MapItem | null {
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

export default function MapView(props: {
  items: MapItem[];
  selected?: {
    id: string;
    title: string;
    city: string;
    district: string | null;
    neighborhood: string | null;
    latitude: number;
    longitude: number;
  } | null;
  filters?: {
    city?: string;
    district?: string;
    neighborhood?: string;
    searchText?: string;
  } | null;
  onSetCity?: (city: string) => void;
  onSetDistrict?: (district: string) => void;
  onSetNeighborhood?: (neighborhood: string) => void;
  onSelectPropertyId?: (id: string) => void;
  onOpenInfo?: () => void;
  /** Haritadan arsa seçildiğinde (tam kayıt + parent selected/opening) */
  onPropertyClick?: (property: MapItem) => void;
  /** Haritadan arsa seçildiğinde (sağ detay paneli için parent state — örn. panelOpen / opening) */
  onOpenPropertyPanel?: () => void;
}) {
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string | undefined;
  const mapRef = useRef<MapRef | null>(null);

  const [level, setLevel] = useState<Level>("region");
  const [pickedRegion, setPickedRegion] = useState("");
  const [pickedCity, setPickedCity] = useState("");
  const [pickedDistrict, setPickedDistrict] = useState("");
  const [pickedNeighborhood, setPickedNeighborhood] = useState("");

  const [provGeo, setProvGeo] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [distGeo, setDistGeo] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });

  const [hoverPolyId, setHoverPolyId] = useState<string | null>(null);
  const [selectedPolyId, setSelectedPolyId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  const SRC_PROV = "src-prov";
  const SRC_DIST = "src-dist";
  const SRC_COUNT = "src-count";
  const SRC_POINTS = "src-points";
  const SRC_FOCUS = "src-focus";
  const SRC_SELECTED = "src-selected";

  const L_PROV_FILL = "prov-fill";
  const L_PROV_GLOW = "prov-glow";
  const L_PROV_OUT = "prov-out";

  const L_DIST_FILL = "dist-fill";
  const L_DIST_GLOW = "dist-glow";
  const L_DIST_OUT = "dist-out";

  const L_COUNT_GLOW = "count-glow";
  const L_COUNT_HEAD = "count-head";
  const L_COUNT_TEXT = "count-text";

  const L_POINT_HIT = "point-hit";
  const L_POINT_GLOW = "point-glow";
  const L_POINT = "point";

  const L_FOCUS_FILL = "focus-fill";
  const L_FOCUS_GLOW = "focus-glow";
  const L_FOCUS_OUT = "focus-out";

  const L_SELECTED_GLOW = "selected-glow";
  const L_SELECTED_POINT = "selected-point";

  /** Property point tıklama sorgusu — yalnızca getLayer(id) ile mevcut katmanlar. */
  const PROPERTY_POINT_LAYER_IDS = [
    L_SELECTED_GLOW,
    L_SELECTED_POINT,
    L_POINT,
    L_POINT_GLOW,
    L_POINT_HIT,
  ] as const;

  const [mapReady, setMapReady] = useState(false);
  const singleListingFitKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadProvince() {
      try {
        const r = await fetch("/geo/gadm41_TUR_1.json", { cache: "no-store" });
        if (!r.ok) throw new Error("gadm41_TUR_1.json okunamadı");
        const gj = await r.json();

        const features = ((gj.features || []) as any[]).map((f, i) => {
          const name = safeStr(f?.properties?.NAME_1);
          const id = safeStr(f?.properties?.GID_1) || `prov_${i}`;
          const region = getRegionName(name);

          return {
            ...f,
            id,
            properties: {
              ...(f.properties || {}),
              id,
              name,
              city: name,
              region,
            },
          };
        });

        if (!alive) return;
        setProvGeo({ type: "FeatureCollection", features });
      } catch (e) {
        console.warn("[MapView] provinces load failed:", e);
      }
    }

    async function loadDistrict() {
      try {
        const r = await fetch("/geo/gadm41_TUR_2.json", { cache: "no-store" });
        if (!r.ok) {
          if (!alive) return;
          setDistGeo({ type: "FeatureCollection", features: [] });
          return;
        }

        const gj = await r.json();

        const features = ((gj.features || []) as any[]).map((f, i) => {
          const city = safeStr(f?.properties?.NAME_1);
          const district = safeStr(f?.properties?.NAME_2);
          const id = safeStr(f?.properties?.GID_2) || `dist_${i}`;

          return {
            ...f,
            id,
            properties: {
              ...(f.properties || {}),
              id,
              name: district,
              city,
              district,
              region: getRegionName(city),
            },
          };
        });

        if (!alive) return;
        setDistGeo({ type: "FeatureCollection", features });
      } catch (e) {
        console.warn("[MapView] districts load failed:", e);
        if (!alive) return;
        setDistGeo({ type: "FeatureCollection", features: [] });
      }
    }

    loadProvince();
    loadDistrict();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const f = props.filters || {};
    const nextCity = safeStr(f.city);
    const nextDistrict = safeStr(f.district);
    const nextNeighborhood = safeStr(f.neighborhood);

    setPickedCity(nextCity);
    setPickedDistrict(nextDistrict);
    setPickedNeighborhood(nextNeighborhood);

    if (nextCity && nextDistrict && nextNeighborhood) {
      setLevel("parcel");
      setPickedRegion(getRegionName(nextCity));
    } else if (nextCity && nextDistrict) {
      setLevel("neighborhood");
      setPickedRegion(getRegionName(nextCity));
    } else if (nextCity) {
      setLevel("district");
      setPickedRegion(getRegionName(nextCity));
    } else {
      setLevel("region");
      // Do not clear a non-Turkey global region selection when filters are empty
      setPickedRegion((prev) => (TURKEY_REGIONS.includes(prev) ? "" : prev));
    }
  }, [props.filters?.city, props.filters?.district, props.filters?.neighborhood]);

  const { list: mergedItems, stats: pipelineStats } = useMemo(
    () => buildValidatedItems(props.items || []),
    [props.items]
  );
  const propsItems = mergedItems;

  useEffect(() => {
    const incoming = props.items?.length ?? 0;
    console.log("[MapView] markers pipeline:", {
      incomingPropertiesCount: incoming,
      validMarkersCount: pipelineStats.valid,
      validMarkersAfterParse: pipelineStats.valid,
      ignoredMarkersCount: pipelineStats.ignored,
      usedFallbackSinglePoint: pipelineStats.usedFallback,
    });
  }, [pipelineStats, props.items]);

  function getNativeMap(): { flyTo: (o: object) => void; getZoom: () => number; easeTo: (o: object) => void } | null {
    const r = mapRef.current as unknown as { getMap?: () => { flyTo: (o: object) => void; getZoom: () => number; easeTo: (o: object) => void } } | null;
    const inner = r?.getMap?.() ?? (r as unknown as { flyTo?: (o: object) => void; getZoom?: () => number } | null);
    if (inner && typeof (inner as { flyTo?: unknown }).flyTo === "function")
      return inner as { flyTo: (o: object) => void; getZoom: () => number; easeTo: (o: object) => void };
    return null;
  }

  /** Seçili ilan değişince haritayı o konuma getir ([lng, lat]). */
  useEffect(() => {
    if (!mapReady) return;
    const map = getNativeMap();
    if (!map || !props.selected) return;
    const c = parsePropertyCoords(props.selected as unknown as MapItem);
    if (!c) return;
    map.flyTo({
      center: [c.lng, c.lat],
      zoom: 14,
      duration: 1200,
    });
  }, [mapReady, props.selected?.id, props.selected?.latitude, props.selected?.longitude]);

  /** Tek onaylı ilan varsa ilk yüklemede o noktaya odaklan. */
  useEffect(() => {
    if (!mapReady) return;
    const map = getNativeMap();
    if (!map || mergedItems.length !== 1) {
      if (mergedItems.length !== 1) singleListingFitKeyRef.current = null;
      return;
    }
    const it = mergedItems[0];
    if (!it) return;
    const c = parsePropertyCoords(it);
    if (!c) return;
    const key = String(it.id ?? "");
    if (singleListingFitKeyRef.current === key) return;
    singleListingFitKeyRef.current = key;
    map.flyTo({
      center: [c.lng, c.lat],
      zoom: 14,
      duration: 1200,
    });
  }, [mapReady, mergedItems]);

  const itemsFiltered = useMemo(() => {
    let arr = mergedItems;
    if (pickedRegion) arr = arr.filter((x) => getItemRegionName(x) === pickedRegion);
    if (pickedCity) arr = arr.filter((x) => sameMapCity(x.city, pickedCity));
    if (pickedDistrict) arr = arr.filter((x) => sameMapDistrict(x.district, pickedDistrict));
    if (pickedNeighborhood) arr = arr.filter((x) => sameMapNeighborhood(x.neighborhood, pickedNeighborhood));
    return arr;
  }, [mergedItems, pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood]);

  const parcelItems = useMemo(() => {
    const withCoords = (list: MapItem[]) =>
      list.map(mapItemWithParsedCoords).filter((it): it is MapItem => it !== null);

    const byCityDistrictNeighborhood = withCoords(
      mergedItems.filter(
        (it) =>
          sameMapCity(it.city, pickedCity) &&
          sameMapDistrict(it.district, pickedDistrict) &&
          sameMapNeighborhood(it.neighborhood, pickedNeighborhood)
      )
    );
    if (byCityDistrictNeighborhood.length > 0) return byCityDistrictNeighborhood;

    const byCityDistrict = withCoords(
      mergedItems.filter(
        (it) => sameMapCity(it.city, pickedCity) && sameMapDistrict(it.district, pickedDistrict)
      )
    );
    if (byCityDistrict.length > 0) return byCityDistrict;

    const byCity = withCoords(mergedItems.filter((it) => sameMapCity(it.city, pickedCity)));
    return byCity;
  }, [mergedItems, pickedCity, pickedDistrict, pickedNeighborhood]);

  /**
   * Parsel noktaları: drill-down (pickedRegion/City/…) ile daraltma yapılmaz —
   * aksi halde tek/çok az marker kalıyordu. Tüm geçerli kayıtlar çizilir.
   */
  const pointsMapItems = useMemo(() => {
    const out: MapItem[] = [];
    for (const p of mergedItems) {
      const m = mapItemWithParsedCoords(p);
      if (m) out.push(m);
    }
    return out;
  }, [mergedItems]);

  useEffect(() => {
    console.log("[MapView] rendered point markers:", {
      renderedMarkerCount: pointsMapItems.length,
    });
  }, [pointsMapItems.length]);

  const pointsGeo = useMemo<FeatureCollection<Point>>(() => {
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
  }, [pointsMapItems]);

  const selectedGeo = useMemo<FeatureCollection<Point>>(() => {
    if (!props.selected) return { type: "FeatureCollection", features: [] };
    const c = parsePropertyCoords(props.selected as unknown as MapItem);
    if (!c) return { type: "FeatureCollection", features: [] };

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: props.selected.id,
          geometry: {
            type: "Point",
            coordinates: [c.lng, c.lat],
          },
          properties: {
            id: props.selected.id,
          },
        },
      ],
    };
  }, [props.selected?.id, props.selected?.latitude, props.selected?.longitude]);

  const regionCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
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
  }, [mergedItems]);

  const provinceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of mergedItems) {
      if (pickedRegion && getItemRegionName(it) !== pickedRegion) continue;
      const k = normTR(it.city);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [mergedItems, pickedRegion]);

  const globalCityCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (!pickedRegion || TURKEY_REGIONS.includes(pickedRegion)) {
      return { type: "FeatureCollection", features: [] };
    }
    const regionItems = mergedItems.filter((x) => getItemRegionName(x) === pickedRegion);
    const m = new Map<
      string,
      { nameRaw: string; count: number; sumLng: number; sumLat: number; n: number }
    >();
    for (const it of regionItems) {
      const key = normTR(it.city || (it as MapItem).country || "");
      if (!key) continue;
      if (!Number.isFinite(it.latitude) || !Number.isFinite(it.longitude)) continue;
      const cur = m.get(key) ?? {
        nameRaw: (it.city || (it as MapItem).country || "").trim() || "Other",
        count: 0,
        sumLng: 0,
        sumLat: 0,
        n: 0,
      };
      if (cur.n === 0) cur.nameRaw = (it.city || (it as MapItem).country || "").trim() || "Other";
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
        level: "city",
      },
      geometry: {
        type: "Point",
        coordinates: [v.sumLng / v.n, v.sumLat / v.n],
      },
    }));
    return { type: "FeatureCollection", features };
  }, [mergedItems, pickedRegion]);

  const districtCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
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
  }, [mergedItems, pickedCity]);

  const neighborhoodCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
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

    // Mahalle alanı boşsa: ilçedeki tüm arsalar tek damlacık (mahalle bilgisi yok)
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
  }, [mergedItems, pickedCity, pickedDistrict]);

  const activeProvinceGeo = useMemo<FeatureCollection>(() => {
    if (!pickedRegion) return provGeo;
    return {
      type: "FeatureCollection",
      features: (provGeo.features || []).filter((f: any) => safeStr(f?.properties?.region) === pickedRegion),
    };
  }, [provGeo, pickedRegion]);

  const activeDistrictGeo = useMemo<FeatureCollection>(() => {
    if (!pickedCity) return { type: "FeatureCollection", features: [] };

    let features = (distGeo.features || []).filter((f: any) =>
      sameMapCity(safeStr(f?.properties?.city) || safeStr(f?.properties?.NAME_1), pickedCity)
    );
    // Mahalle adımında sadece seçili ilçe sınırı (tüm ilçe alanları üst üste görünmesin)
    if (level === "neighborhood" && pickedDistrict) {
      features = features.filter((f: any) =>
        sameMapDistrict(safeStr(f?.properties?.district) || safeStr(f?.properties?.NAME_2), pickedDistrict)
      );
    }

    return { type: "FeatureCollection", features };
  }, [distGeo, pickedCity, pickedDistrict, level]);

  /** Parsel adımında hafif vurgu: sadece GADM ilçe sınırı (property noktalarından hull/kapsül çizilmez). */
  const parcelFocusGeo = useMemo<FeatureCollection<Polygon>>(() => {
    if (level !== "parcel") return { type: "FeatureCollection", features: [] };

    const districtGeom = activeDistrictGeo.features.find((f: any) =>
      sameMapDistrict(safeStr(f?.properties?.district) || safeStr(f?.properties?.NAME_2), pickedDistrict)
    )?.geometry;
    if (!districtGeom) return { type: "FeatureCollection", features: [] };

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: `focus_dist_${normTR(pickedDistrict)}`,
          properties: { id: `focus_dist_${normTR(pickedDistrict)}`, name: pickedDistrict },
          geometry: districtGeom as any,
        },
      ],
    };
  }, [level, pickedDistrict, activeDistrictGeo]);

  const activePoly = useMemo(() => {
    if (level === "city") {
      return { src: SRC_PROV, fill: L_PROV_FILL, glow: L_PROV_GLOW, out: L_PROV_OUT };
    }
    if (level === "district" || level === "neighborhood") {
      return { src: SRC_DIST, fill: L_DIST_FILL, glow: L_DIST_GLOW, out: L_DIST_OUT };
    }
    return null;
  }, [level]);

  const countGeo = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (level === "region") return regionCenters;

    if (level === "city") {
      if (pickedRegion && !TURKEY_REGIONS.includes(pickedRegion)) {
        return globalCityCenters;
      }
      const rawCityFeatures = (activeProvinceGeo.features || []).map((f: any) => {
        const name = safeStr(f?.properties?.name) || safeStr(f?.properties?.NAME_1);
        const center = centroidFromGeometry(f.geometry);
        if (!name || !center) return null;

        const fromMap = provinceCounts.get(normTR(name)) ?? 0;
        const fromItems = mergedItems.filter(
          (it) =>
            (!pickedRegion || getItemRegionName(it) === pickedRegion) && sameMapCity(it.city, name)
        ).length;
        const count = Math.max(fromMap, fromItems);

        const feat: Feature<Point, CountPointProps> = {
          type: "Feature",
          id: `cnt_city_${safeStr(f?.properties?.id) || normTR(name)}`,
          properties: {
            id: `cnt_city_${safeStr(f?.properties?.id) || normTR(name)}`,
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
        return feat;
      });
      const features = rawCityFeatures
        .filter((x): x is Feature<Point, CountPointProps> => x !== null)
        .filter((x) => Number(x.properties?.count || 0) > 0);

      return { type: "FeatureCollection", features };
    }

    if (level === "district") return districtCenters;
    if (level === "neighborhood") return neighborhoodCenters;

    return { type: "FeatureCollection", features: [] };
  }, [
    level,
    regionCenters,
    activeProvinceGeo,
    provinceCounts,
    globalCityCenters,
    districtCenters,
    neighborhoodCenters,
    mergedItems,
    pickedRegion,
  ]);

  function fillPaintDefault() {
    return {
      "fill-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(245,215,110,0.12)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.08)",
        "rgba(245,215,110,0.025)",
      ],
      "fill-opacity": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        0.22,
        ["boolean", ["feature-state", "hover"], false],
        0.14,
        0.08,
      ],
    } as any;
  }

  function lineGlowPaint() {
    return {
      "line-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(245,215,110,0.82)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.62)",
        "rgba(201,162,39,0.22)",
      ],
      "line-width": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        6,
        ["boolean", ["feature-state", "hover"], false],
        4.5,
        2.4,
      ],
      "line-blur": 1.6,
      "line-opacity": 1,
    } as any;
  }

  function lineOutPaint() {
    return {
      "line-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(255,240,180,0.92)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.85)",
        "rgba(245,215,110,0.44)",
      ],
      "line-width": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        1.8,
        ["boolean", ["feature-state", "hover"], false],
        1.45,
        0.9,
      ],
      "line-opacity": 1,
    } as any;
  }

  function clearPolyHover() {
    const map = mapRef.current;
    if (!map || !activePoly) return;

    if (hoverPolyId) {
      try {
        map.setFeatureState({ source: activePoly.src, id: hoverPolyId }, { hover: false });
      } catch {}
    }

    setHoverPolyId(null);
  }

  function clearPointHover() {
    const map = mapRef.current;
    if (!map) return;

    if (hoveredPointId) {
      try {
        map.setFeatureState({ source: SRC_POINTS, id: hoveredPointId }, { hover: false });
      } catch {}
    }

    setHoveredPointId(null);
  }

  /**
   * Sadece çokgen/çizgi: bbox fitBounds. Damlacık (Point) için false döner — zoom her zaman
   * ilgili arsa listesine göre zoomToItems ile yapılır (bölge/il görünümü bozulmasın).
   */
  function tryZoomToClickedFeature(map: MapRef | null | undefined, feature: any): boolean {
    if (!map || !feature?.geometry) return false;
    const g = feature.geometry;
    if (g.type === "Point") return false;
    if (
      g.type === "Polygon" ||
      g.type === "MultiPolygon" ||
      g.type === "LineString" ||
      g.type === "MultiLineString"
    ) {
      const bb = bboxFromGeometry(g);
      if (!bb) return false;
      const spanLng = bb.maxLng - bb.minLng;
      const spanLat = bb.maxLat - bb.minLat;
      if (spanLng < 1e-8 && spanLat < 1e-8) return false;
      const span = Math.max(spanLng, spanLat);
      const maxZoom = span > 0.8 ? 7.8 : span > 0.25 ? 9.8 : span > 0.08 ? 11.8 : 13.2;
      map.fitBounds(
        [
          [bb.minLng, bb.minLat],
          [bb.maxLng, bb.maxLat],
        ],
        { padding: 110, duration: 800, maxZoom }
      );
      return true;
    }
    return false;
  }

  function zoomToGeometry(geom: any, maxZoom = 13) {
    const map = mapRef.current;
    if (!map) return;
    const bb = bboxFromGeometry(geom);
    if (!bb) return;

    map.fitBounds(
      [
        [bb.minLng, bb.minLat],
        [bb.maxLng, bb.maxLat],
      ],
      { padding: 72, duration: 800, maxZoom }
    );
  }

  /** İl sınırı (GADM) — arsa noktaları tek bölgede kümeli olsa bile tüm ilçe poligonları düzgün görünsün */
  function zoomToProvinceBoundsByCityName(cityName: string): boolean {
    const map = mapRef.current;
    if (!map || !cityName) return false;
    const feat = (provGeo.features || []).find((f: any) => {
      const n = safeStr(f?.properties?.name) || safeStr(f?.properties?.NAME_1);
      return normTR(n) === normTR(cityName);
    });
    if (!feat?.geometry) return false;
    const bb = bboxFromGeometry(feat.geometry);
    if (!bb) return false;
    map.fitBounds(
      [
        [bb.minLng, bb.minLat],
        [bb.maxLng, bb.maxLat],
      ],
      { padding: 52, duration: 800, maxZoom: 12.2 }
    );
    return true;
  }

  /**
   * İlçe tıklaması / seçimi: önce tıklanan poligon, yoksa GADM’den ilçe geometrisi.
   * fitBounds (padding 120, maxZoom 12.5) veya centroid flyTo (zoom 11.8).
   */
  function zoomToDistrictCamera(
    map: MapRef | null | undefined,
    clickedFeature: any | null | undefined,
    cityName: string,
    districtName: string
  ): boolean {
    if (!map || !cityName?.trim() || !districtName?.trim()) return false;

    let geom: any = null;
    const cg = clickedFeature?.geometry;
    if (
      cg &&
      (cg.type === "Polygon" ||
        cg.type === "MultiPolygon" ||
        cg.type === "LineString" ||
        cg.type === "MultiLineString")
    ) {
      geom = cg;
    }
    if (!geom) {
      const feat = findDistrictFeatureRobust(distGeo, cityName, districtName);
      geom = feat?.geometry ?? null;
    }

    if (geom) {
      const bb = bboxFromGeometry(geom);
      if (bb) {
        const spanLng = bb.maxLng - bb.minLng;
        const spanLat = bb.maxLat - bb.minLat;
        if (spanLng > 1e-8 || spanLat > 1e-8) {
          map.fitBounds(
            [
              [bb.minLng, bb.minLat],
              [bb.maxLng, bb.maxLat],
            ],
            { padding: 120, duration: 900, maxZoom: 12.5 }
          );
          return true;
        }
      }
      const c = centroidFromGeometry(geom);
      if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        map.flyTo({ center: [c[0], c[1]], zoom: 11.8, duration: 900 });
        return true;
      }
    }
    return false;
  }

  /** Count damlacığı vb. (tıklanan poligon yok) — aynı kadraj mantığı */
  function zoomToDistrictBoundsByCityAndDistrict(cityName: string, districtName: string): boolean {
    return zoomToDistrictCamera(mapRef.current, null, cityName, districtName);
  }

  /**
   * Arsa noktalarına göre kadraj. Mapbox'ta fitBounds'taki maxZoom = üst sınır (yakınlaşma tavanı);
   * düşük değer (ör. 8.7) küçük alanlarda haritayı gereğinden uzak tutuyordu → 16 kullanıyoruz.
   * minZoomHint: bbox küçükse moveend sonrası minimum zoom ile okunabilirlik.
   */
  function zoomToItems(list: MapItem[], minZoomHint: number) {
    const map = mapRef.current;
    if (!map || !list.length) return;

    const pts = list.map(mapItemWithParsedCoords).filter((x): x is MapItem => x !== null);
    if (!pts.length) return;

    if (pts.length === 1) {
      map.flyTo({
        center: [pts[0].longitude, pts[0].latitude],
        zoom: Math.min(16, Math.max(minZoomHint, 11)),
        duration: 800,
      });
      return;
    }

    let minLng = pts[0].longitude;
    let minLat = pts[0].latitude;
    let maxLng = pts[0].longitude;
    let maxLat = pts[0].latitude;

    for (const p of pts) {
      minLng = Math.min(minLng, p.longitude);
      minLat = Math.min(minLat, p.latitude);
      maxLng = Math.max(maxLng, p.longitude);
      maxLat = Math.max(maxLat, p.latitude);
    }

    const spanLng = maxLng - minLng;
    const spanLat = maxLat - minLat;
    const spanDeg = Math.max(spanLng, spanLat);

    /** Global + yerel karışınca bbox tüm dünyayı kaplar — dünya görünümüne düşmeyi önle */
    if (spanDeg > 22 || spanLng > 40 || spanLat > 25) {
      let cx = 0;
      let cy = 0;
      for (const p of pts) {
        cx += p.longitude;
        cy += p.latitude;
      }
      cx /= pts.length;
      cy /= pts.length;
      map.flyTo({
        center: [cx, cy],
        zoom: Math.min(16, Math.max(minZoomHint, 5.4)),
        duration: 800,
      });
      return;
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 72, duration: 800, maxZoom: 16 }
    );

    const onDone = () => {
      const z = map.getZoom();
      let floor = 0;
      if (spanDeg < 0.12) floor = Math.max(minZoomHint, 12.2);
      else if (spanDeg < 0.28) floor = Math.max(minZoomHint, 11);
      else if (spanDeg < 0.55) floor = Math.max(minZoomHint, 9.8);
      else if (spanDeg < 1.1) floor = Math.max(minZoomHint, 8.6);
      if (floor > 0 && z < floor) {
        map.easeTo({ zoom: floor, center: map.getCenter(), duration: 520 });
      }
    };

    map.once("moveend", onDone);
  }

  function zoomHome() {
    const map = getNativeMap();
    if (!map) return;
    map.easeTo({
      center: [MAP_CENTER_LNG, MAP_CENTER_LAT],
      zoom: MAP_ZOOM,
      duration: 650,
    });
  }

  function goBack() {
    clearPointHover();
    clearPolyHover();
    setSelectedPolyId(null);

    if (level === "parcel") {
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");
      setLevel("neighborhood");

      const list = mergedItems.filter((it) => sameMapCity(it.city, pickedCity) && sameMapDistrict(it.district, pickedDistrict));
      zoomToItems(list, 10.9);
      return;
    }

    if (level === "neighborhood") {
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("district");

      if (!zoomToProvinceBoundsByCityName(pickedCity)) {
        const list = mergedItems.filter((it) => sameMapCity(it.city, pickedCity));
        zoomToItems(list, 10.8);
      }
      return;
    }

    if (level === "district") {
      setPickedCity("");
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetCity?.("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("city");

      const list = mergedItems.filter((it) => getItemRegionName(it) === pickedRegion);
      zoomToItems(list, 6.2);
      return;
    }

    if (level === "city") {
      setPickedRegion("");
      setPickedCity("");
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetCity?.("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("region");
      zoomHome();
    }
  }

  function handleCountNavigation(f: any, _clickedFeature?: any) {
    const nameRaw = String(f.properties?.name || "").trim();
    if (!nameRaw) return;

    if (level === "region") {
      setPickedRegion(nameRaw);
      setPickedCity("");
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetCity?.("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("city");

      const regionItems = mergedItems.filter((it) => getItemRegionName(it) === nameRaw);
      zoomToItems(regionItems, 6.4);
      return;
    }

    if (level === "city") {
      const realCity =
        mergedItems.find(
          (it) => getItemRegionName(it) === pickedRegion && sameMapCity(it.city, nameRaw)
        )?.city || nameRaw;

      setPickedCity(realCity);
      props.onSetCity?.(realCity);
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("district");

      const cityItems = mergedItems.filter((it) => sameMapCity(it.city, realCity));
      if (!zoomToProvinceBoundsByCityName(realCity)) {
        zoomToItems(cityItems, 10.8);
      }
      return;
    }

    if (level === "district") {
      const realDistrict =
        mergedItems
          .filter((it) => sameMapCity(it.city, pickedCity))
          .find((it) => sameMapDistrict(it.district, nameRaw))?.district || nameRaw;

      setPickedDistrict(String(realDistrict));
      props.onSetDistrict?.(String(realDistrict));
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");

      const districtItems = mergedItems.filter(
        (it) => sameMapCity(it.city, pickedCity) && sameMapDistrict(it.district, realDistrict)
      );
      const hasNeighborhoods = districtItems.some((it) => (it.neighborhood ?? "").trim() !== "");
      if (districtItems.length > 0 && !hasNeighborhoods) {
        setLevel("parcel");
      } else {
        setLevel("neighborhood");
      }

      const polyHint = _clickedFeature;
      const cityForZoom = pickedCity;
      const districtStr = String(realDistrict);
      const fallbackZoom = districtItems.length > 0 && !hasNeighborhoods ? 15.4 : 10.9;
      queueMicrotask(() => {
        const m = mapRef.current;
        if (!m) return;
        if (!zoomToDistrictCamera(m, polyHint ?? null, cityForZoom, districtStr)) {
          zoomToItems(districtItems, fallbackZoom);
        }
      });
      return;
    }

    if (level === "neighborhood") {
      if (String(f.properties?.neighborhood) === "__ALL__" || nameRaw === "Tümü") {
        setPickedNeighborhood("");
        props.onSetNeighborhood?.("");
        setLevel("parcel");
        const districtItems = mergedItems.filter(
          (it) => sameMapCity(it.city, pickedCity) && sameMapDistrict(it.district, pickedDistrict)
        );
        zoomToItems(districtItems, 14);
        return;
      }

      const realNeighborhood =
        mergedItems
          .filter((it) => sameMapCity(it.city, pickedCity))
          .filter((it) => sameMapDistrict(it.district, pickedDistrict))
          .find((it) => sameMapNeighborhood(it.neighborhood, nameRaw))?.neighborhood || nameRaw;

      setPickedNeighborhood(String(realNeighborhood));
      props.onSetNeighborhood?.(String(realNeighborhood));
      setLevel("parcel");

      const neighborhoodItems = mergedItems.filter(
        (it) =>
          sameMapCity(it.city, pickedCity) &&
          sameMapDistrict(it.district, pickedDistrict) &&
          sameMapNeighborhood(it.neighborhood, realNeighborhood)
      );
      zoomToItems(neighborhoodItems, 14.2);
    }
  }

  /** Native Mapbox map (getLayer güvenilir). */
  function getMapboxMap(map: MapRef | null): { getLayer: (id: string) => unknown } | null {
    if (!map) return null;
    const inner =
      (map as unknown as { getMap?: () => { getLayer?: (id: string) => unknown } }).getMap?.() ?? map;
    if (typeof inner?.getLayer !== "function") return null;
    return inner as { getLayer: (id: string) => unknown };
  }

  /** Sadece map.getLayer(id) != null olan property point katmanları — queryRenderedFeatures için. */
  function filterPropertyPointLayerIds(map: MapRef): string[] {
    const m = getMapboxMap(map);
    if (!m) return [];
    return PROPERTY_POINT_LAYER_IDS.filter((id) => {
      try {
        return m.getLayer(id) != null;
      } catch {
        return false;
      }
    });
  }

  /** Parselde: sadece property point katmanları — bbox ile yedek hit (kesin yakalama). */
  function queryPropertyPointFeatures(map: MapRef, e: any, pointLayerIds: string[]): any[] {
    if (pointLayerIds.length === 0) return [];
    let hits = map.queryRenderedFeatures(e.point, { layers: pointLayerIds });
    if (hits && hits.length > 0) return hits;
    const p = e.point;
    const pad = 16;
    const x = typeof p?.x === "number" ? p.x : Number(p?.[0]);
    const y = typeof p?.y === "number" ? p.y : Number(p?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    hits = map.queryRenderedFeatures(
      [
        [x - pad, y - pad],
        [x + pad, y + pad],
      ],
      { layers: pointLayerIds }
    );
    return hits && hits.length > 0 ? hits : [];
  }

  /** Tıklanan piksele en yakın point feature — id çözümlemesi resolveMapItemFromFeature’da */
  function pickClosestPropertyPointFeature(hits: any[], lng: number, lat: number): any | null {
    let best: any = null;
    let bestKm = Infinity;
    for (const f of hits) {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) continue;
      const d = haversineKm([lng, lat], [Number(c[0]), Number(c[1])]);
      if (d < bestKm) {
        bestKm = d;
        best = f;
      }
    }
    return best;
  }

  function canonicalPropertyId(raw: string): string | null {
    const s = String(raw).trim();
    if (!s) return null;
    const real = findMapItemByIdLikeInList(propsItems, s);
    if (real) return String(real.id);
    const hit = findMapItemByIdLikeInList(pointsMapItems, s) || findMapItemByIdLikeInList(mergedItems, s);
    return hit ? String(hit.id) : null;
  }

  function findMapItemByCanonicalId(canonical: string): MapItem | null {
    return findMapItemByIdLikeInList(propsItems, canonical);
  }

  function resolveMapItemFromFeature(f: any): MapItem | null {
    const list = propsItems;
    if (!list.length) return null;

    const raw = extractRawPropertyIdFromFeature(f);
    if (raw) {
      const byId = findMapItemByIdLikeInList(list, raw);
      if (byId) return byId;
    }
    const g = f?.geometry;
    if (g?.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const lng = Number(g.coordinates[0]);
      const lat = Number(g.coordinates[1]);
      /** Render / tıklama koordinatı farkı için kademeli tolerans */
      const byCoord =
        findMapItemByCoords(list, lng, lat, 2e-4) ||
        findMapItemByCoords(list, lng, lat, 1.2e-3) ||
        findMapItemByCoords(list, lng, lat, 5e-3);
      if (byCoord) return byCoord;
    }
    const propsObj = f?.properties;
    if (propsObj && typeof propsObj === "object") {
      const byMeta = findMapItemByCityDistrictTitle(list, propsObj as Record<string, unknown>);
      if (byMeta) return byMeta;
    }
    return null;
  }

  function emitPropertySelectedFromMap(id: string) {
    const sid = String(id).trim();

    const found = findMapItemByIdLikeInList(propsItems, id) ?? findMapItemByIdLikeInList(mergedItems, id);
    if (found) {
      const map = getNativeMap();
      const c = parsePropertyCoords(found);
      if (map && c) {
        map.flyTo({
          center: [c.lng, c.lat],
          zoom: 14,
          duration: 1200,
        });
      }
    }
    props.onOpenPropertyPanel?.();
    if (found && props.onPropertyClick) {
      props.onPropertyClick(found);
      return;
    }
    const canonical = canonicalPropertyId(id);
    props.onSelectPropertyId?.(canonical ?? sid);
    props.onOpenInfo?.();
  }

  function emitPropertyFromMapItem(item: MapItem) {
    const map = getNativeMap();
    const c = parsePropertyCoords(item);
    if (map && c) {
      map.flyTo({
        center: [c.lng, c.lat],
        zoom: 14,
        duration: 1200,
      });
    }
    props.onOpenPropertyPanel?.();
    if (props.onPropertyClick) {
      props.onPropertyClick(item);
      return;
    }
    props.onSelectPropertyId?.(String(item.id).trim());
    props.onOpenInfo?.();
  }

  function onMapClick(e: any) {
    const map = mapRef.current;
    if (!map) return;

    // 0) İlan noktası — tüm zoom/ seviye (count / poly öncesi)
    const pointLayerIds = filterPropertyPointLayerIds(map);
    if (pointLayerIds.length > 0) {
      const hits = queryPropertyPointFeatures(map, e, pointLayerIds);
      if (hits.length > 0) {
        const lng = Number(e.lngLat?.lng);
        const lat = Number(e.lngLat?.lat);
        const best =
          Number.isFinite(lng) && Number.isFinite(lat)
            ? pickClosestPropertyPointFeature(hits, lng, lat)
            : hits[0];
        if (best) {
          const resolved = resolveMapItemFromFeature(best);
          if (resolved) {
            emitPropertyFromMapItem(resolved);
            return;
          }
          const rawId = extractRawPropertyIdFromFeature(best);
          if (rawId) {
            emitPropertySelectedFromMap(rawId);
            return;
          }
          const clng = Number(best.geometry?.coordinates?.[0]);
          const clat = Number(best.geometry?.coordinates?.[1]);
          if (Number.isFinite(clng) && Number.isFinite(clat)) {
            const near =
              findMapItemByCoords(propsItems, clng, clat, 1.2e-3) ||
              findMapItemByCoords(propsItems, clng, clat, 5e-3);
            if (near) {
              emitPropertyFromMapItem(near);
              return;
            }
          }
          return;
        }
      }
    }

    const topFeature = e.features?.[0];

    if (level !== "parcel") {
      const countLayerIds = filterExistingLayerIds(map, [L_COUNT_GLOW, L_COUNT_HEAD, L_COUNT_TEXT]);
      if (countLayerIds.length > 0) {
        const countHits = map.queryRenderedFeatures(e.point, {
          layers: countLayerIds,
        });
        if (countHits && countHits.length > 0) {
          handleCountNavigation(countHits[0], topFeature);
          return;
        }
      }
    }

    if (activePoly) {
      const polyLayerIds = filterExistingLayerIds(map, [activePoly.fill, activePoly.out, activePoly.glow]);
      const hits =
        polyLayerIds.length > 0
          ? map.queryRenderedFeatures(e.point, {
              layers: polyLayerIds,
            })
          : [];
      if (hits && hits.length > 0) {
        const f: any = hits[0];
        const featForZoom: any = topFeature ?? f;
        const geom = f.geometry;
        const p = f.properties || {};
        const id = String(p.id || f.id || "");
        if (id) setSelectedPolyId(id);

        if (level === "city") {
          const cityNameRaw = String(p.name || p.NAME_1 || "").trim();
          if (cityNameRaw) {
            const realCity = mergedItems.find((it) => sameMapCity(it.city, cityNameRaw))?.city || cityNameRaw;
            setPickedCity(realCity);
            props.onSetCity?.(realCity);
          }

          setPickedDistrict("");
          setPickedNeighborhood("");
          props.onSetDistrict?.("");
          props.onSetNeighborhood?.("");
          setLevel("district");
          if (!tryZoomToClickedFeature(map, featForZoom) && geom) zoomToGeometry(geom, 13);
          return;
        }

        if (level === "district") {
          const districtNameRaw = String(p.name || p.NAME_2 || p.district || "").trim();
          if (districtNameRaw) {
            const realDistrict =
              mergedItems
                .filter((it) => sameMapCity(it.city, pickedCity))
                .find((it) => sameMapDistrict(it.district, districtNameRaw))?.district || districtNameRaw;

            setPickedDistrict(String(realDistrict));
            props.onSetDistrict?.(String(realDistrict));
            setPickedNeighborhood("");
            props.onSetNeighborhood?.("");

            const districtItems = mergedItems.filter(
              (it) => sameMapCity(it.city, pickedCity) && sameMapDistrict(it.district, realDistrict)
            );
            const hasNeighborhoods = districtItems.some((it) => (it.neighborhood ?? "").trim() !== "");
            const polyForZoom = f;
            const cityForZoom = pickedCity;
            const districtStr = String(realDistrict);
            const fallbackZoom = districtItems.length > 0 && !hasNeighborhoods ? 15.4 : 10.9;
            if (districtItems.length > 0 && !hasNeighborhoods) {
              setLevel("parcel");
            } else {
              setLevel("neighborhood");
            }
            queueMicrotask(() => {
              const m = mapRef.current;
              if (!m) return;
              if (!zoomToDistrictCamera(m, polyForZoom, cityForZoom, districtStr)) {
                zoomToItems(districtItems, fallbackZoom);
              }
            });
          }
          return;
        }

        if (level === "neighborhood") {
          const districtItems = mergedItems.filter(
            (it) => sameMapCity(it.city, pickedCity) && sameMapDistrict(it.district, pickedDistrict)
          );

          if (districtItems.length > 0) {
            setLevel("parcel");
            if (!tryZoomToClickedFeature(map, featForZoom)) zoomToItems(districtItems, 15.4);
          }
          return;
        }
      }
    }

    if (level === "parcel") {
      const lng = Number(e.lngLat.lng);
      const lat = Number(e.lngLat.lat);

      // 1. Property point seçimi yukarıda (onMapClick başı) — burada tekrar yok

      // 2. Focus polygon click -> select nearest property
      const focusLayerIds = filterExistingLayerIds(map, [L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT]);
      const focusHits =
        focusLayerIds.length > 0
          ? map.queryRenderedFeatures(e.point, {
              layers: focusLayerIds,
            })
          : [];
      if (focusHits && focusHits.length > 0) {
        const nearest = nearestItemToLngLat(parcelItems, lng, lat);
        if (nearest) {
          emitPropertyFromMapItem(nearest);
          return;
        }
      }

      // 3. Fallback: no point/focus hit -> select nearest property to click
      const nearest = nearestItemToLngLat(parcelItems, lng, lat);
      if (nearest) {
        emitPropertyFromMapItem(nearest);
      }
    }
  }

  /** queryRenderedFeatures öncesi: stilde olmayan layer id'leri Mapbox hata vermesin diye ele. */
  function filterExistingLayerIds(map: MapRef, layerIds: readonly string[]): string[] {
    const m = getMapboxMap(map);
    if (!m) return [];
    return layerIds.filter((id) => {
      try {
        return m.getLayer(id) != null;
      } catch {
        return false;
      }
    });
  }

  /** Cluster / promoteId bazen id'yi sadece feature.id'de tutar; koordinattan da eşle. */
  function resolvePropertyIdFromParcelFeature(f: any, items: MapItem[]): string | null {
    const fromFields = extractRawPropertyIdFromFeature(f);
    if (fromFields != null) {
      const hitById =
        findMapItemByIdLikeInList(pointsMapItems, fromFields) || findMapItemByIdLikeInList(mergedItems, fromFields);
      if (hitById) return String(hitById.id);
      const s = String(fromFields).trim();
      if (s) return s;
    }
    const g = f?.geometry;
    if (g?.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
      const lng = Number(g.coordinates[0]);
      const lat = Number(g.coordinates[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      const hit =
        findMapItemByCoords(pointsMapItems, lng, lat, 1.2e-3) ||
        findMapItemByCoords(mergedItems, lng, lat, 1.2e-3) ||
        findMapItemByCoords(items, lng, lat, 1.2e-3);
      return hit?.id ?? null;
    }
    return null;
  }

  function onMouseMove(e: any) {
    const map = mapRef.current;
    if (!map) return;

    // 1) İlan noktaları — önce (count’tan önce)
    if (pointsMapItems.length > 0) {
      const pointLayerIds = filterExistingLayerIds(map, [
        L_SELECTED_GLOW,
        L_SELECTED_POINT,
        L_POINT_HIT,
        L_POINT_GLOW,
        L_POINT,
      ]);
      if (pointLayerIds.length > 0) {
        const hits = map.queryRenderedFeatures(e.point, { layers: pointLayerIds });
        const pointHit = hits.find((h: any) => {
          const layerId = String(h.layer?.id || "");
          return (
            layerId === L_POINT_HIT ||
            layerId === L_POINT_GLOW ||
            layerId === L_POINT ||
            layerId === L_SELECTED_POINT ||
            layerId === L_SELECTED_GLOW
          );
        });
        if (pointHit) {
          map.getCanvas().style.cursor = "pointer";
          clearPolyHover();
          const pid = resolvePropertyIdFromParcelFeature(pointHit, pointsMapItems);
          if (pid && pid !== hoveredPointId) {
            if (hoveredPointId) {
              try {
                map.setFeatureState({ source: SRC_POINTS, id: hoveredPointId }, { hover: false });
              } catch {}
            }
            try {
              map.setFeatureState({ source: SRC_POINTS, id: pid }, { hover: true });
            } catch {}
            setHoveredPointId(pid);
          }
          return;
        }
      }
    }

    if (hoveredPointId) {
      try {
        map.setFeatureState({ source: SRC_POINTS, id: hoveredPointId }, { hover: false });
      } catch {}
      setHoveredPointId(null);
    }

    if (level !== "parcel") {
      const countLayerIds = filterExistingLayerIds(map, [L_COUNT_GLOW, L_COUNT_HEAD, L_COUNT_TEXT]);
      if (countLayerIds.length > 0) {
        const countHits = map.queryRenderedFeatures(e.point, {
          layers: countLayerIds,
        });
        if (countHits && countHits.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          clearPolyHover();
          return;
        }
      }
    }

    if (activePoly) {
      const polyLayerIds = filterExistingLayerIds(map, [activePoly.fill, activePoly.out, activePoly.glow]);
      if (polyLayerIds.length > 0) {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: polyLayerIds,
        });
        if (hits && hits.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          const f: any = hits[0];
          const pid = String(f.properties?.id || f.id || "");

          if (pid && pid !== hoverPolyId) {
            if (hoverPolyId) {
              try {
                map.setFeatureState({ source: activePoly.src, id: hoverPolyId }, { hover: false });
              } catch {}
            }

            try {
              map.setFeatureState({ source: activePoly.src, id: pid }, { hover: true });
            } catch {}

            setHoverPolyId(pid);
          }

          return;
        } else if (hoverPolyId) {
          try {
            map.setFeatureState({ source: activePoly.src, id: hoverPolyId }, { hover: false });
          } catch {}
          setHoverPolyId(null);
        }
      } else if (hoverPolyId) {
        try {
          map.setFeatureState({ source: activePoly.src, id: hoverPolyId }, { hover: false });
        } catch {}
        setHoverPolyId(null);
      }
    }

    if (level === "parcel") {
      const focusLayerIds = filterExistingLayerIds(map, [L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT]);
      if (focusLayerIds.length > 0) {
        const fhits = map.queryRenderedFeatures(e.point, { layers: focusLayerIds });
        if (fhits && fhits.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          return;
        }
      }
    }

    map.getCanvas().style.cursor = "";
  }

  function onMouseLeave() {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = "";
    clearPolyHover();
    clearPointHover();
  }

  const badgeText = useMemo(() => {
    if (level === "region") return "Bölgeler";
    if (level === "city") return `İller • ${pickedRegion || "Türkiye"}`;
    if (level === "district") return `İlçeler • ${pickedCity || "—"}`;
    if (level === "neighborhood") return `Mahalleler • ${pickedCity}${pickedDistrict ? ` / ${pickedDistrict}` : ""}`;
    return `Parseller • ${pickedCity}${pickedDistrict ? ` / ${pickedDistrict}` : ""}${pickedNeighborhood ? ` / ${pickedNeighborhood}` : ""}`;
  }, [level, pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood]);

  const districtScopePropertyCount = useMemo(() => {
    return mergedItems.filter((x) => {
      if (!sameMapCity(x.city, pickedCity)) return false;
      if (pickedDistrict?.trim()) return sameMapDistrict(x.district, pickedDistrict);
      return true;
    }).length;
  }, [mergedItems, pickedCity, pickedDistrict]);

  const summaryText = useMemo(() => {
    if (level === "region") return `${mergedItems.length} arsa • bölgesel görünüm`;
    if (level === "city") {
      const count = mergedItems.filter((x) => (!pickedRegion ? true : getItemRegionName(x) === pickedRegion)).length;
      return `${count} arsa • il görünümü`;
    }
    if (level === "district") {
      return `${districtScopePropertyCount} arsa • ilçe görünümü`;
    }
    if (level === "neighborhood") {
      const count = mergedItems.filter((x) => {
        if (!sameMapCity(x.city, pickedCity) || !sameMapDistrict(x.district, pickedDistrict)) return false;
        if (pickedNeighborhood?.trim()) return sameMapNeighborhood(x.neighborhood, pickedNeighborhood);
        return true;
      }).length;
      return `${count} arsa • mahalle görünümü`;
    }
    return `${parcelItems.length} arsa • parsel görünümü`;
  }, [
    level,
    mergedItems,
    pickedRegion,
    pickedCity,
    pickedDistrict,
    pickedNeighborhood,
    parcelItems.length,
    districtScopePropertyCount,
  ]);

  const interactiveLayers = useMemo(() => {
    const arr: string[] = [];
    if (activePoly) arr.push(activePoly.fill, activePoly.glow, activePoly.out);
    if (level !== "parcel") {
      arr.push(L_COUNT_GLOW, L_COUNT_HEAD, L_COUNT_TEXT);
    }
    if (pointsMapItems.length > 0) {
      arr.push(L_POINT_HIT, L_POINT_GLOW, L_POINT, L_SELECTED_GLOW, L_SELECTED_POINT);
    }
    if (level === "parcel") {
      arr.push(L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT);
    }
    return arr;
  }, [activePoly, level, pointsMapItems.length]);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16, color: "white" }}>
        MAPBOX TOKEN yok: <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>
      </div>
    );
  }

  const countGlowLayer: any = {
    id: L_COUNT_GLOW,
    type: "circle",
    source: SRC_COUNT,
    paint: {
      "circle-radius": ["step", ["get", "count"], 20, 10, 22, 25, 25, 60, 28, 120, 31],
      "circle-color": "rgba(245,215,110,0.18)",
      "circle-blur": 1.2,
      "circle-opacity": 1,
    },
  };

  const countHeadLayer: any = {
    id: L_COUNT_HEAD,
    type: "circle",
    source: SRC_COUNT,
    paint: {
      "circle-radius": ["step", ["get", "count"], 10, 10, 11.5, 25, 13, 60, 15, 120, 17],
      "circle-color": "rgba(201,162,39,0.94)",
      "circle-stroke-width": 1.6,
      "circle-stroke-color": "rgba(255,245,220,0.26)",
      "circle-opacity": 0.98,
    },
  };

  const countTextLayer: any = {
    id: L_COUNT_TEXT,
    type: "symbol",
    source: SRC_COUNT,
    layout: {
      "text-field": ["concat", ["get", "name"], "\n", ["to-string", ["get", "count"]]],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 9, 8, 10, 11, 12, 16, 13],
      "text-line-height": 1.08,
      "text-anchor": "top",
      "text-offset": [0, 1.15],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(8,12,22,0.95)",
      "text-halo-width": 1.35,
    },
  };

  /** Parselde kümeleme yok: tıklama / panel her zoom seviyesinde tek noktaya gider */
  const pointHitLayer: any = {
    id: L_POINT_HIT,
    type: "circle",
    source: SRC_POINTS,
    paint: {
      "circle-radius": 16,
      "circle-color": "rgba(0,0,0,0)",
      "circle-opacity": 0.01,
    },
  };

  const pointGlowLayer: any = {
    id: L_POINT_GLOW,
    type: "circle",
    source: SRC_POINTS,
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 12, 8],
      "circle-color": "rgba(245,215,110,0.22)",
      "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.7],
      "circle-blur": 1,
    },
  };

  const pointLayer: any = {
    id: L_POINT,
    type: "circle",
    source: SRC_POINTS,
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 6.5, 4.5],
      "circle-color": "rgba(10,14,24,0.96)",
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,1)",
        "rgba(201,162,39,0.92)",
      ],
      "circle-stroke-width": 2,
      "circle-opacity": 1,
    },
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 18,
          background: "rgba(8,12,22,0.62)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(10px)",
          color: "white",
          boxShadow: "0 12px 28px rgba(0,0,0,0.20)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
          <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>{badgeText}</div>
          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>{summaryText}</div>
        </div>

        {level !== "region" && (
          <button
            onClick={goBack}
            style={{
              marginLeft: 6,
              padding: "8px 12px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ← Geri
          </button>
        )}
      </div>

      <MapGL
        ref={(r) => {
          mapRef.current = r;
        }}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={{ longitude: MAP_CENTER_LNG, latitude: MAP_CENTER_LAT, zoom: MAP_ZOOM }}
        minZoom={3}
        maxZoom={17}
        onLoad={() => setMapReady(true)}
        onClick={onMapClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        interactiveLayerIds={interactiveLayers}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />

        {level === "city" && (
          <Source id={SRC_PROV} type="geojson" data={activeProvinceGeo} promoteId="id">
            <Layer id={L_PROV_FILL} type="fill" paint={fillPaintDefault()} />
            <Layer id={L_PROV_GLOW} type="line" paint={lineGlowPaint()} />
            <Layer id={L_PROV_OUT} type="line" paint={lineOutPaint()} />
          </Source>
        )}

        {(level === "district" || level === "neighborhood") && (
          <Source id={SRC_DIST} type="geojson" data={activeDistrictGeo} promoteId="id">
            <Layer id={L_DIST_FILL} type="fill" paint={fillPaintDefault()} />
            <Layer id={L_DIST_GLOW} type="line" paint={lineGlowPaint()} />
            <Layer id={L_DIST_OUT} type="line" paint={lineOutPaint()} />
          </Source>
        )}

        {level === "parcel" && (
          <Source id={SRC_FOCUS} type="geojson" data={parcelFocusGeo}>
            <Layer
              id={L_FOCUS_FILL}
              type="fill"
              paint={{
                "fill-color": "rgba(245,215,110,0.06)",
                "fill-opacity": 0.18,
              }}
            />
            <Layer
              id={L_FOCUS_GLOW}
              type="line"
              paint={{
                "line-color": "rgba(245,215,110,0.75)",
                "line-width": 6,
                "line-blur": 2,
                "line-opacity": 1,
              }}
            />
            <Layer
              id={L_FOCUS_OUT}
              type="line"
              paint={{
                "line-color": "rgba(255,240,180,0.9)",
                "line-width": 1.6,
                "line-opacity": 1,
              }}
            />
          </Source>
        )}

        {level !== "parcel" && (
          <Source id={SRC_COUNT} type="geojson" data={countGeo}>
            <Layer {...countGlowLayer} />
            <Layer {...countHeadLayer} />
            <Layer {...countTextLayer} />
          </Source>
        )}

        {pointsMapItems.length > 0 && (
          <Source
            id={SRC_POINTS}
            type="geojson"
            data={pointsGeo}
            cluster={false}
            promoteId={"id" as any}
          >
            <Layer {...pointHitLayer} />
            <Layer {...pointGlowLayer} />
            <Layer {...pointLayer} />
          </Source>
        )}

        {pointsMapItems.length > 0 && selectedGeo.features.length > 0 && (
          <Source id={SRC_SELECTED} type="geojson" data={selectedGeo}>
            <Layer
              id={L_SELECTED_GLOW}
              type="circle"
              paint={{
                "circle-radius": 15,
                "circle-color": "rgba(245,215,110,0.3)",
                "circle-blur": 1,
                "circle-opacity": 1,
              }}
            />
            <Layer
              id={L_SELECTED_POINT}
              type="circle"
              paint={{
                "circle-radius": 7.5,
                "circle-color": "rgba(10,14,24,1)",
                "circle-stroke-color": "rgba(255,240,180,1)",
                "circle-stroke-width": 2.2,
                "circle-opacity": 1,
              }}
            />
          </Source>
        )}
      </MapGL>
    </div>
  );
}