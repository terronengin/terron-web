"use client";

import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, MapRef, NavigationControl, Source } from "react-map-gl/mapbox";

type MapItem = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  country?: string | null;
};

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
  const pts = list.filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
  if (!pts.length) return null;

  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.longitude;
    sy += p.latitude;
  }
  return [sx / pts.length, sy / pts.length];
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

function polygonFeature(id: string, name: string, ring: [number, number][]) {
  const closed =
    ring.length > 0 &&
    (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
      ? [...ring, ring[0]]
      : ring;

  return {
    type: "Feature" as const,
    id,
    properties: { id, name },
    geometry: {
      type: "Polygon" as const,
      coordinates: [closed],
    },
  };
}

function circlePolygon(center: [number, number], radiusKm = 0.22, steps = 28): [number, number][] {
  const [lng, lat] = center;
  const latDeg = radiusKm / 110.57;
  const lngDeg = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);

  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    pts.push([lng + Math.cos(a) * lngDeg, lat + Math.sin(a) * latDeg]);
  }
  pts.push(pts[0]);
  return pts;
}

function capsulePolygon(a: [number, number], b: [number, number], radiusKm = 0.18, steps = 10): [number, number][] {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const midLat = (lat1 + lat2) / 2;
  const kx = 111.32 * Math.cos((midLat * Math.PI) / 180) || 1;
  const ky = 110.57;

  const ax = lng1 * kx;
  const ay = lat1 * ky;
  const bx = lng2 * kx;
  const by = lat2 * ky;

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const r = radiusKm;
  const ptsXY: Array<[number, number]> = [];

  for (let i = 0; i <= steps; i++) {
    const t = Math.PI / 2 - (Math.PI * i) / steps;
    const x = bx + Math.cos(t) * px * r + Math.sin(t) * ux * r;
    const y = by + Math.cos(t) * py * r + Math.sin(t) * uy * r;
    ptsXY.push([x, y]);
  }

  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 - (Math.PI * i) / steps;
    const x = ax + Math.cos(t) * px * r + Math.sin(t) * ux * r;
    const y = ay + Math.cos(t) * py * r + Math.sin(t) * uy * r;
    ptsXY.push([x, y]);
  }

  const ring: [number, number][] = ptsXY.map(([x, y]) => [x / kx, y / ky]);
  ring.push(ring[0]);
  return ring;
}

function cross(o: [number, number], a: [number, number], b: [number, number]) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: [number, number][]) {
  const pts = Array.from(new Map(points.map((p) => [`${p[0].toFixed(6)}_${p[1].toFixed(6)}`, p])).values());

  if (pts.length <= 1) return pts;
  pts.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function expandPolygonFromCentroid(ring: [number, number][], expandKm = 0.12): [number, number][] {
  if (ring.length < 3) return ring;

  let cx = 0;
  let cy = 0;
  for (const [lng, lat] of ring) {
    cx += lng;
    cy += lat;
  }
  cx /= ring.length;
  cy /= ring.length;

  return ring.map(([lng, lat]) => {
    const midLat = (lat + cy) / 2;
    const kx = 111.32 * Math.cos((midLat * Math.PI) / 180) || 1;
    const ky = 110.57;

    const vx = (lng - cx) * kx;
    const vy = (lat - cy) * ky;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;

    const nx = vx / len;
    const ny = vy / len;

    return [lng + (nx * expandKm) / kx, lat + (ny * expandKm) / ky];
  });
}

function polygonFromPoints(points: [number, number][]) {
  if (points.length === 0) return null;
  if (points.length === 1) return circlePolygon(points[0], 0.22, 28);

  if (points.length === 2) {
    const d = haversineKm(points[0], points[1]);
    return capsulePolygon(points[0], points[1], Math.max(0.12, Math.min(0.26, d * 0.12)), 12);
  }

  const hull = convexHull(points);
  if (hull.length < 3) return circlePolygon(points[0], 0.22, 28);

  const expanded = expandPolygonFromCentroid(hull, 0.12);
  return [...expanded, expanded[0]];
}

function nearestItemToLngLat(list: MapItem[], lng: number, lat: number): MapItem | null {
  if (!list.length) return null;

  let best: MapItem | null = null;
  let bestDist = Infinity;

  for (const it of list) {
    if (!Number.isFinite(it.latitude) || !Number.isFinite(it.longitude)) continue;
    const d = haversineKm([lng, lat], [it.longitude, it.latitude]);
    if (d < bestDist) {
      bestDist = d;
      best = it;
    }
  }

  return best;
}export default function MapView(props: {
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

  const L_CLUSTER_GLOW = "cluster-glow";
  const L_CLUSTER_HEAD = "cluster-head";
  const L_CLUSTER_TEXT = "cluster-text";

  const L_POINT_HIT = "point-hit";
  const L_POINT_GLOW = "point-glow";
  const L_POINT = "point";

  const L_FOCUS_FILL = "focus-fill";
  const L_FOCUS_GLOW = "focus-glow";
  const L_FOCUS_OUT = "focus-out";

  const L_SELECTED_GLOW = "selected-glow";
  const L_SELECTED_POINT = "selected-point";

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

  const allItems = props.items || [];

  const itemsFiltered = useMemo(() => {
    let arr = allItems;
    if (pickedRegion) arr = arr.filter((x) => getItemRegionName(x) === pickedRegion);
    if (pickedCity) arr = arr.filter((x) => sameTR(x.city, pickedCity));
    if (pickedDistrict) arr = arr.filter((x) => sameTR(x.district ?? "", pickedDistrict));
    if (pickedNeighborhood) arr = arr.filter((x) => sameTR(x.neighborhood ?? "", pickedNeighborhood));
    return arr;
  }, [allItems, pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood]);

  const parcelItems = useMemo(() => {
    const withCoords = (list: MapItem[]) =>
      list.filter((it) => Number.isFinite(it.latitude) && Number.isFinite(it.longitude));

    const byCityDistrictNeighborhood = withCoords(
      allItems.filter(
        (it) =>
          sameTR(it.city, pickedCity) &&
          sameTR(it.district ?? "", pickedDistrict) &&
          sameTR(it.neighborhood ?? "", pickedNeighborhood)
      )
    );
    if (byCityDistrictNeighborhood.length > 0) return byCityDistrictNeighborhood;

    const byCityDistrict = withCoords(
      allItems.filter(
        (it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", pickedDistrict)
      )
    );
    if (byCityDistrict.length > 0) return byCityDistrict;

    const byCity = withCoords(allItems.filter((it) => sameTR(it.city, pickedCity)));
    return byCity;
  }, [allItems, pickedCity, pickedDistrict, pickedNeighborhood]);

  useEffect(() => {
    if (level !== "parcel") return;
    const beforeFallback = allItems.filter(
      (it) =>
        sameTR(it.city, pickedCity) &&
        sameTR(it.district ?? "", pickedDistrict) &&
        sameTR(it.neighborhood ?? "", pickedNeighborhood) &&
        Number.isFinite(it.latitude) &&
        Number.isFinite(it.longitude)
    ).length;
    console.log("[MapView parcel] pickedCity:", pickedCity, "| pickedDistrict:", pickedDistrict, "| pickedNeighborhood:", pickedNeighborhood, "| parcelItems before fallback:", beforeFallback, "| parcelItems after fallback:", parcelItems.length);
  }, [level, pickedCity, pickedDistrict, pickedNeighborhood, parcelItems.length, allItems.length]);

  const pointsGeo = useMemo<FeatureCollection<Point>>(() => {
    const source = level === "parcel" ? parcelItems : itemsFiltered;
    return {
      type: "FeatureCollection",
      features: source
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => ({
          type: "Feature" as const,
          id: p.id,
          geometry: {
            type: "Point" as const,
            coordinates: [p.longitude, p.latitude],
          },
          properties: {
            id: p.id,
            title: p.title,
            city: p.city,
            district: p.district ?? "",
            neighborhood: p.neighborhood ?? "",
          },
        })),
    };
  }, [level, parcelItems, itemsFiltered]);

  const selectedGeo = useMemo<FeatureCollection<Point>>(() => {
    if (!props.selected || !Number.isFinite(props.selected.latitude) || !Number.isFinite(props.selected.longitude)) {
      return { type: "FeatureCollection", features: [] };
    }

    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: props.selected.id,
          geometry: {
            type: "Point",
            coordinates: [props.selected.longitude, props.selected.latitude],
          },
          properties: {
            id: props.selected.id,
          },
        },
      ],
    };
  }, [props.selected?.id, props.selected?.latitude, props.selected?.longitude]);

  const regionCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    const regions = Array.from(new Set(allItems.map((x) => getItemRegionName(x)))).sort(regionSort);

    const rawFeatures = regions.map((region) => {
      const list = allItems.filter((x) => getItemRegionName(x) === region);
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
  }, [allItems]);

  const provinceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of allItems) {
      if (pickedRegion && getItemRegionName(it) !== pickedRegion) continue;
      const k = normTR(it.city);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [allItems, pickedRegion]);

  const globalCityCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (!pickedRegion || TURKEY_REGIONS.includes(pickedRegion)) {
      return { type: "FeatureCollection", features: [] };
    }
    const regionItems = allItems.filter((x) => getItemRegionName(x) === pickedRegion);
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
  }, [allItems, pickedRegion]);

  const districtCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (!pickedCity) return { type: "FeatureCollection", features: [] };

    const cityK = normTR(pickedCity);
    const m = new Map<string, { districtRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();

    for (const it of allItems) {
      if (normTR(it.city) !== cityK) continue;
      const dRaw = (it.district ?? "").trim();
      const dK = normTR(dRaw);
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
  }, [allItems, pickedCity]);

  const neighborhoodCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (!pickedCity || !pickedDistrict) return { type: "FeatureCollection", features: [] };

    const cityK = normTR(pickedCity);
    const distK = normTR(pickedDistrict);
    const m = new Map<string, { neighborhoodRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();

    for (const it of allItems) {
      if (normTR(it.city) !== cityK) continue;
      if (normTR(it.district ?? "") !== distK) continue;

      const nRaw = (it.neighborhood ?? "").trim();
      const nKey = normTR(nRaw);
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

    return { type: "FeatureCollection", features };
  }, [allItems, pickedCity, pickedDistrict]);  const activeProvinceGeo = useMemo<FeatureCollection>(() => {
    if (!pickedRegion) return provGeo;
    return {
      type: "FeatureCollection",
      features: (provGeo.features || []).filter((f: any) => safeStr(f?.properties?.region) === pickedRegion),
    };
  }, [provGeo, pickedRegion]);

  const activeDistrictGeo = useMemo<FeatureCollection>(() => {
    if (!pickedCity) return { type: "FeatureCollection", features: [] };

    return {
      type: "FeatureCollection",
      features: (distGeo.features || []).filter((f: any) => sameTR(safeStr(f?.properties?.city), pickedCity)),
    };
  }, [distGeo, pickedCity]);

  const parcelFocusGeo = useMemo<FeatureCollection<Polygon>>(() => {
    if (level !== "parcel") return { type: "FeatureCollection", features: [] };

    if (pickedNeighborhood && parcelItems.length > 0) {
      const pts = parcelItems.map((p) => [p.longitude, p.latitude] as [number, number]);
      const ring = polygonFromPoints(pts);

      if (ring && ring.length >= 4) {
        return {
          type: "FeatureCollection",
          features: [polygonFeature(`focus_${normTR(pickedNeighborhood)}`, pickedNeighborhood, ring)],
        };
      }
    }

    const districtGeom = activeDistrictGeo.features.find((f: any) => sameTR(f?.properties?.district, pickedDistrict))?.geometry;
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
  }, [level, pickedDistrict, pickedNeighborhood, parcelItems, activeDistrictGeo]);

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

        const feat: Feature<Point, CountPointProps> = {
          type: "Feature",
          id: `cnt_city_${safeStr(f?.properties?.id) || normTR(name)}`,
          properties: {
            id: `cnt_city_${safeStr(f?.properties?.id) || normTR(name)}`,
            name,
            city: name,
            count: provinceCounts.get(normTR(name)) ?? 0,
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
  }, [level, regionCenters, activeProvinceGeo, provinceCounts, globalCityCenters, districtCenters, neighborhoodCenters]);

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

  function zoomToGeometry(geom: any, maxZoom = 9.4) {
    const map = mapRef.current;
    if (!map) return;
    const bb = bboxFromGeometry(geom);
    if (!bb) return;

    map.fitBounds(
      [
        [bb.minLng, bb.minLat],
        [bb.maxLng, bb.maxLat],
      ],
      { padding: 60, duration: 650, maxZoom }
    );
  }

  function zoomToItems(list: MapItem[], targetZoom: number) {
    const map = mapRef.current;
    if (!map || !list.length) return;

    const pts = list.filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
    if (!pts.length) return;

    if (pts.length === 1) {
      map.easeTo({
        center: [pts[0].longitude, pts[0].latitude],
        zoom: targetZoom,
        duration: 520,
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

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 70, duration: 650, maxZoom: targetZoom }
    );
  }

  function zoomHome() {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [35.0, 39.0],
      zoom: 5.2,
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

      const list = allItems.filter((it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", pickedDistrict));
      zoomToItems(list, 10.9);
      return;
    }

    if (level === "neighborhood") {
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("district");

      const list = allItems.filter((it) => sameTR(it.city, pickedCity));
      zoomToItems(list, 8.1);
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

      const list = allItems.filter((it) => getItemRegionName(it) === pickedRegion);
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

  function handleCountNavigation(f: any) {
    const nameRaw = String(f.properties?.name || "").trim();
    if (!nameRaw) return;

    if (level === "region") {
      console.log("[MapView count click] level=region clicked name:", nameRaw, "| pickedRegion before:", pickedRegion);
      setPickedRegion(nameRaw);
      setPickedCity("");
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetCity?.("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("city");

      const regionItems = allItems.filter((it) => getItemRegionName(it) === nameRaw);
      zoomToItems(regionItems, 6.2);
      console.log("[MapView count click] level=region pickedRegion after:", nameRaw, "| pickedCity after:", "", "| pickedDistrict after:", "", "| pickedNeighborhood after:", "");
      return;
    }

    if (level === "city") {
      const realCity =
        allItems.find(
          (it) => getItemRegionName(it) === pickedRegion && normTR(it.city) === normTR(nameRaw)
        )?.city || nameRaw;

      console.log("[MapView count click] level=city clicked name:", nameRaw, "| pickedRegion before:", pickedRegion, "| pickedCity before:", pickedCity, "| resolvedCity:", realCity);
      setPickedCity(realCity);
      props.onSetCity?.(realCity);
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("district");

      const cityItems = allItems.filter((it) => sameTR(it.city, realCity));
      zoomToItems(cityItems, 8.1);
      return;
    }

    if (level === "district") {
      const realDistrict =
        allItems
          .filter((it) => sameTR(it.city, pickedCity))
          .find((it) => normTR(it.district ?? "") === normTR(nameRaw))?.district || nameRaw;

      setPickedDistrict(String(realDistrict));
      props.onSetDistrict?.(String(realDistrict));
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");
      setLevel("neighborhood");

      const districtItems = allItems.filter(
        (it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", realDistrict)
      );
      zoomToItems(districtItems, 10.9);
      console.log("[MapView count click] level=district clicked name:", nameRaw, "| pickedCity:", pickedCity, "| pickedDistrict after:", String(realDistrict));
      return;
    }

    if (level === "neighborhood") {
      const realNeighborhood =
        allItems
          .filter((it) => sameTR(it.city, pickedCity))
          .filter((it) => sameTR(it.district ?? "", pickedDistrict))
          .find((it) => normTR(it.neighborhood ?? "") === normTR(nameRaw))?.neighborhood || nameRaw;

      console.log("[MapView count click] level=neighborhood clicked name:", nameRaw, "| pickedCity:", pickedCity, "| pickedDistrict:", pickedDistrict, "| pickedNeighborhood before:", pickedNeighborhood, "| resolvedNeighborhood:", realNeighborhood);
      setPickedNeighborhood(String(realNeighborhood));
      props.onSetNeighborhood?.(String(realNeighborhood));
      setLevel("parcel");

      const neighborhoodItems = allItems.filter(
        (it) =>
          sameTR(it.city, pickedCity) &&
          sameTR(it.district ?? "", pickedDistrict) &&
          sameTR(it.neighborhood ?? "", realNeighborhood)
      );
      zoomToItems(neighborhoodItems, 16.2);
    }
  }  function onMapClick(e: any) {
    const map = mapRef.current;
    if (!map) return;

    if (level !== "parcel") {
      const countHits = map.queryRenderedFeatures(e.point, {
        layers: [L_COUNT_GLOW, L_COUNT_HEAD, L_COUNT_TEXT],
      });
      if (countHits && countHits.length > 0) {
        handleCountNavigation(countHits[0]);
        return;
      }
    }

    if (activePoly) {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [activePoly.fill, activePoly.out, activePoly.glow],
      });
      if (hits && hits.length > 0) {
        const f: any = hits[0];
        const geom = f.geometry;
        const p = f.properties || {};
        const id = String(p.id || f.id || "");
        if (id) setSelectedPolyId(id);

        if (level === "city") {
          const cityNameRaw = String(p.name || p.NAME_1 || "").trim();
          if (cityNameRaw) {
            const realCity = allItems.find((it) => normTR(it.city) === normTR(cityNameRaw))?.city || cityNameRaw;
            setPickedCity(realCity);
            props.onSetCity?.(realCity);
          }

          setPickedDistrict("");
          setPickedNeighborhood("");
          props.onSetDistrict?.("");
          props.onSetNeighborhood?.("");
          setLevel("district");
          if (geom) zoomToGeometry(geom, 8.1);
          return;
        }

        if (level === "district") {
          const districtNameRaw = String(p.name || p.NAME_2 || p.district || "").trim();
          if (districtNameRaw) {
            const realDistrict =
              allItems
                .filter((it) => sameTR(it.city, pickedCity))
                .find((it) => normTR(it.district ?? "") === normTR(districtNameRaw))?.district || districtNameRaw;

            setPickedDistrict(String(realDistrict));
            props.onSetDistrict?.(String(realDistrict));
            setPickedNeighborhood("");
            props.onSetNeighborhood?.("");

            const districtItems = allItems.filter(
              (it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", realDistrict)
            );
            const hasNeighborhoods = districtItems.some((it) => (it.neighborhood ?? "").trim() !== "");
            if (districtItems.length > 0 && !hasNeighborhoods) {
              setLevel("parcel");
              zoomToItems(districtItems, 15.4);
            } else {
              setLevel("neighborhood");
              zoomToItems(districtItems, 10.9);
            }
          }
          return;
        }

        if (level === "neighborhood") {
          const districtItems = allItems.filter(
            (it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", pickedDistrict)
          );

          if (districtItems.length > 0) {
            setLevel("parcel");
            zoomToItems(districtItems, 15.4);
          }
          return;
        }
      }
    }

    if (level === "parcel") {
      const lng = Number(e.lngLat.lng);
      const lat = Number(e.lngLat.lat);

      // 1. Prioritize actual property point hits (check point layers first)
      const pointHits = map.queryRenderedFeatures(e.point, {
        layers: [L_SELECTED_POINT, L_POINT, L_POINT_HIT],
      });
      if (pointHits && pointHits.length > 0) {
        const top: any = pointHits[0];
        const layerId = String(top.layer?.id || "");
        const id = String(top.properties?.id || "");
        if (id) {
          console.log("[MapView parcel click] pickedCity:", pickedCity, "| pickedDistrict:", pickedDistrict, "| pickedNeighborhood:", pickedNeighborhood, "| parcelItems count:", parcelItems.length, "| clicked layer:", layerId, "| property id:", id, "| onSelectPropertyId: called", "| onOpenInfo: called");
          props.onSelectPropertyId?.(id);
          props.onOpenInfo?.();
          return;
        }
      }

      // 2. Cluster click -> zoom only
      const clusterHits = map.queryRenderedFeatures(e.point, {
        layers: [L_CLUSTER_GLOW, L_CLUSTER_HEAD, L_CLUSTER_TEXT],
      });
      if (clusterHits && clusterHits.length > 0) {
        const top: any = clusterHits[0];
        const isCluster = !!(top.properties && top.properties.cluster);
        if (isCluster) {
          const clusterId = top.properties.cluster_id;
          const source: any = map.getSource(SRC_POINTS);
          if (source) {
            source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
              if (err) return;
              const [clng, clat] = top.geometry.coordinates;
              map.easeTo({ center: [clng, clat], zoom: Math.min(zoom, 17), duration: 420 });
            });
          }
          return;
        }
      }

      // 3. Focus polygon click -> select nearest property
      const focusHits = map.queryRenderedFeatures(e.point, {
        layers: [L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT],
      });
      if (focusHits && focusHits.length > 0) {
        const nearest = nearestItemToLngLat(parcelItems, lng, lat);
        if (nearest) {
          console.log("[MapView parcel click] pickedCity:", pickedCity, "| pickedDistrict:", pickedDistrict, "| pickedNeighborhood:", pickedNeighborhood, "| parcelItems count:", parcelItems.length, "| clicked layer: focus polygon", "| property id:", nearest.id, "| onSelectPropertyId: called", "| onOpenInfo: called");
          props.onSelectPropertyId?.(nearest.id);
          props.onOpenInfo?.();
          return;
        }
      }

      // 4. Fallback: no point/focus hit -> select nearest property to click
      const nearest = nearestItemToLngLat(parcelItems, lng, lat);
      if (nearest) {
        console.log("[MapView parcel click] pickedCity:", pickedCity, "| pickedDistrict:", pickedDistrict, "| pickedNeighborhood:", pickedNeighborhood, "| parcelItems count:", parcelItems.length, "| clicked layer: (fallback nearest)", "| property id:", nearest.id, "| onSelectPropertyId: called", "| onOpenInfo: called");
        props.onSelectPropertyId?.(nearest.id);
        props.onOpenInfo?.();
      } else {
        console.log("[MapView parcel click] pickedCity:", pickedCity, "| pickedDistrict:", pickedDistrict, "| pickedNeighborhood:", pickedNeighborhood, "| parcelItems count:", parcelItems.length, "| clicked layer: (none)", "| property id: (none)", "| onSelectPropertyId: not called", "| onOpenInfo: not called");
      }
    }
  }

  function onMouseMove(e: any) {
    const map = mapRef.current;
    if (!map) return;

    if (level !== "parcel") {
      const countHits = map.queryRenderedFeatures(e.point, {
        layers: [L_COUNT_GLOW, L_COUNT_HEAD, L_COUNT_TEXT],
      });
      if (countHits && countHits.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        clearPolyHover();
        clearPointHover();
        return;
      }
    }

    if (activePoly) {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [activePoly.fill, activePoly.out, activePoly.glow],
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

        clearPointHover();
        return;
      } else if (hoverPolyId) {
        try {
          map.setFeatureState({ source: activePoly.src, id: hoverPolyId }, { hover: false });
        } catch {}
        setHoverPolyId(null);
      }
    }

    if (level === "parcel") {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: [
          L_CLUSTER_GLOW,
          L_CLUSTER_HEAD,
          L_CLUSTER_TEXT,
          L_POINT_HIT,
          L_POINT,
          L_SELECTED_POINT,
          L_FOCUS_FILL,
          L_FOCUS_GLOW,
          L_FOCUS_OUT,
        ],
      });

      if (!hits || hits.length === 0) {
        map.getCanvas().style.cursor = "";
        clearPointHover();
        return;
      }

      map.getCanvas().style.cursor = "pointer";

      const f: any = hits[0];
      const isCluster = !!(f.properties && f.properties.cluster);
      if (isCluster) {
        clearPointHover();
        return;
      }

      const pointHit = hits.find((h: any) => {
        const layerId = String(h.layer?.id || "");
        return layerId === L_POINT_HIT || layerId === L_POINT || layerId === L_SELECTED_POINT;
      });

      if (!pointHit) {
        clearPointHover();
        return;
      }

      const pid = String(pointHit.properties?.id || "");
      if (!pid || pid === hoveredPointId) return;

      if (hoveredPointId) {
        try {
          map.setFeatureState({ source: SRC_POINTS, id: hoveredPointId }, { hover: false });
        } catch {}
      }

      try {
        map.setFeatureState({ source: SRC_POINTS, id: pid }, { hover: true });
      } catch {}

      setHoveredPointId(pid);
      return;
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

  const summaryText = useMemo(() => {
    if (level === "region") return `${allItems.length} arsa • bölgesel görünüm`;
    if (level === "city") {
      const count = allItems.filter((x) => (!pickedRegion ? true : getItemRegionName(x) === pickedRegion)).length;
      return `${count} arsa • il görünümü`;
    }
    if (level === "district") {
      const count = allItems.filter((x) => sameTR(x.city, pickedCity)).length;
      return `${count} arsa • ilçe görünümü`;
    }
    if (level === "neighborhood") {
      const count = allItems.filter((x) => sameTR(x.city, pickedCity) && sameTR(x.district ?? "", pickedDistrict)).length;
      return `${count} arsa • mahalle görünümü`;
    }
    return `${parcelItems.length} arsa • parsel görünümü`;
  }, [level, allItems, pickedRegion, pickedCity, pickedDistrict, parcelItems.length]);

  const interactiveLayers = useMemo(() => {
    const arr: string[] = [];
    if (activePoly) arr.push(activePoly.fill, activePoly.glow, activePoly.out);
    arr.push(L_COUNT_GLOW, L_COUNT_HEAD, L_COUNT_TEXT);
    if (level === "parcel") {
      arr.push(
        L_CLUSTER_GLOW,
        L_CLUSTER_HEAD,
        L_CLUSTER_TEXT,
        L_POINT_HIT,
        L_POINT,
        L_SELECTED_POINT,
        L_FOCUS_FILL,
        L_FOCUS_GLOW,
        L_FOCUS_OUT
      );
    }
    return arr;
  }, [activePoly, level]);

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
      "text-size": 11,
      "text-line-height": 1.08,
      "text-anchor": "top",
      "text-offset": [0, 1.15],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(8,12,22,0.95)",
      "text-halo-width": 1.2,
    },
  };

  const clusterGlowLayer: any = {
    id: L_CLUSTER_GLOW,
    type: "circle",
    source: SRC_POINTS,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 18, 8, 20, 20, 23, 50, 27, 120, 31],
      "circle-color": "rgba(245,215,110,0.16)",
      "circle-blur": 1.2,
      "circle-opacity": 1,
    },
  };

  const clusterHeadLayer: any = {
    id: L_CLUSTER_HEAD,
    type: "circle",
    source: SRC_POINTS,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 10, 8, 11.5, 20, 13.5, 50, 16, 120, 19],
      "circle-color": "rgba(16,20,28,0.98)",
      "circle-stroke-color": "rgba(212,175,55,0.95)",
      "circle-stroke-width": 1.9,
      "circle-opacity": 0.98,
    },
  };

  const clusterTextLayer: any = {
    id: L_CLUSTER_TEXT,
    type: "symbol",
    source: SRC_POINTS,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 11,
      "text-anchor": "center",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#F8E7B0",
      "text-halo-color": "rgba(8,12,22,0.92)",
      "text-halo-width": 1.0,
    },
  };  const pointHitLayer: any = {
    id: L_POINT_HIT,
    type: "circle",
    source: SRC_POINTS,
    filter: ["!", ["has", "point_count"]],
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
    filter: ["!", ["has", "point_count"]],
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
    filter: ["!", ["has", "point_count"]],
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
        initialViewState={{ longitude: 35, latitude: 39, zoom: 5.2 }}
        minZoom={3}
        maxZoom={17}
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

        {level === "parcel" && (
          <Source
            id={SRC_POINTS}
            type="geojson"
            data={pointsGeo}
            cluster={true}
            clusterRadius={40}
            clusterMaxZoom={14}
            promoteId={"id" as any}
          >
            <Layer {...clusterGlowLayer} />
            <Layer {...clusterHeadLayer} />
            <Layer {...clusterTextLayer} />
            <Layer {...pointHitLayer} />
            <Layer {...pointGlowLayer} />
            <Layer {...pointLayer} />
          </Source>
        )}

        {level === "parcel" && selectedGeo.features.length > 0 && (
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