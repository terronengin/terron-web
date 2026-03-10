"use client";

import type { Feature, FeatureCollection, Point } from "geojson";
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
};

type Level = "region" | "city" | "district" | "neighborhood" | "parcel";

type CountPointProps = {
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
  const t = geom.type;
  const c = geom.coordinates;
  const out: number[][] = [];

  const pushRing = (ring: any) => {
    if (!Array.isArray(ring)) return;
    for (const pt of ring) {
      if (Array.isArray(pt) && pt.length >= 2) out.push([Number(pt[0]), Number(pt[1])]);
    }
  };

  if (t === "Polygon") {
    if (Array.isArray(c) && c.length > 0) {
      for (const ring of c) pushRing(ring);
    }
  } else if (t === "MultiPolygon") {
    if (Array.isArray(c)) {
      for (const poly of c) {
        if (Array.isArray(poly)) {
          for (const ring of poly) pushRing(ring);
        }
      }
    }
  }

  return out;
}

function bboxFromGeometry(geom: any) {
  const pts = coordsFromGeometry(geom);
  if (pts.length === 0) return null;

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

function centroidFromGeometry(geom: any) {
  const pts = coordsFromGeometry(geom);
  if (pts.length === 0) return null;

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
  return [sx / n, sy / n] as [number, number];
}

function getRegionName(cityRaw: string) {
  const city = normTR(cityRaw);

  const marmara = ["istanbul", "edirne", "kirklareli", "tekirdag", "kocaeli", "sakarya", "yalova", "bursa", "balikesir", "canakkale", "bilecik"];
  const ege = ["izmir", "manisa", "aydin", "mugla", "denizli", "usak", "kutahya", "afyonkarahisar"];
  const akdeniz = ["antalya", "burdur", "isparta", "mersin", "adana", "hatay", "osmaniye", "kahramanmaras"];
  const icAnadolu = ["ankara", "eskisehir", "konya", "aksaray", "karaman", "kirsehir", "nevsehir", "nigde", "kayseri", "sivas", "yozgat", "cankiri"];
  const karadeniz = ["samsun", "ordu", "giresun", "trabzon", "rize", "artvin", "gumushane", "tokat", "amasya", "corum", "sinop", "kastamonu", "zonguldak", "karabuk", "duzce", "bolu", "bartin"];
  const dogu = ["erzurum", "erzincan", "kars", "igdir", "agri", "ardahan", "mus", "bingol", "tunceli", "malatya", "elazig", "van", "bitlis", "hakkari"];
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

export default function MapView(props: {
  items: MapItem[];
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

  const [provGeo, setProvGeo] = useState<any>({ type: "FeatureCollection", features: [] });
  const [distGeo, setDistGeo] = useState<any>({ type: "FeatureCollection", features: [] });

  const [hoverPolyId, setHoverPolyId] = useState<string | null>(null);
  const [selectedPolyId, setSelectedPolyId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  const SRC_PROV = "src-prov";
  const SRC_DIST = "src-dist";
  const SRC_COUNT = "src-count";
  const SRC_POINTS = "src-points";

  const L_PROV_FILL = "prov-fill";
  const L_PROV_GLOW = "prov-glow";
  const L_PROV_OUT = "prov-out";

  const L_DIST_FILL = "dist-fill";
  const L_DIST_GLOW = "dist-glow";
  const L_DIST_OUT = "dist-out";

  const L_COUNT_PIN = "count-pin";
  const L_COUNT_TEXT = "count-text";

  const L_CLUSTER_PIN = "cluster-pin";
  const L_CLUSTER_TEXT = "cluster-text";
  const L_POINT = "point";

  useEffect(() => {
    let alive = true;

    async function loadProvince() {
      try {
        const r = await fetch("/geo/gadm41_TUR_1.json", { cache: "no-store" });
        if (!r.ok) throw new Error("gadm41_TUR_1.json okunamadı");
        const gj = await r.json();

        const features = (gj.features || []).map((f: any, i: number) => {
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
              regionColor:
                region === "Marmara"
                  ? "#6DE0FF"
                  : region === "Ege"
                  ? "#73F5C3"
                  : region === "Akdeniz"
                  ? "#F8B24D"
                  : region === "İç Anadolu"
                  ? "#C6A6FF"
                  : region === "Karadeniz"
                  ? "#7ED0FF"
                  : region === "Doğu Anadolu"
                  ? "#FF9CC7"
                  : region === "Güneydoğu Anadolu"
                  ? "#FFB06B"
                  : "#F5D76E",
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

        const features = (gj.features || []).map((f: any, i: number) => {
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

  const itemsFiltered = useMemo(() => {
    let arr = props.items || [];
    if (pickedRegion) arr = arr.filter((x) => getRegionName(x.city) === pickedRegion);
    if (pickedCity) arr = arr.filter((x) => sameTR(x.city, pickedCity));
    if (pickedDistrict) arr = arr.filter((x) => sameTR(x.district ?? "", pickedDistrict));
    if (pickedNeighborhood) arr = arr.filter((x) => sameTR(x.neighborhood ?? "", pickedNeighborhood));
    return arr;
  }, [props.items, pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood]);

  const pointsGeo = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: itemsFiltered
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
  }, [itemsFiltered]);

  const regionCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    const m = new Map<string, { count: number; sumLng: number; sumLat: number; n: number }>();

    for (const it of props.items || []) {
      if (!Number.isFinite(it.latitude) || !Number.isFinite(it.longitude)) continue;
      const region = getRegionName(it.city);
      const cur = m.get(region) ?? { count: 0, sumLng: 0, sumLat: 0, n: 0 };
      cur.count += 1;
      cur.sumLng += Number(it.longitude);
      cur.sumLat += Number(it.latitude);
      cur.n += 1;
      m.set(region, cur);
    }

    const features: Feature<Point, CountPointProps>[] = Array.from(m.entries()).map(([region, v]) => ({
      type: "Feature",
      id: `cnt_region_${normTR(region)}`,
      properties: {
        name: region,
        region,
        count: v.count,
        level: "region",
      },
      geometry: {
        type: "Point",
        coordinates: [v.sumLng / v.n, v.sumLat / v.n],
      },
    }));

    return { type: "FeatureCollection", features };
  }, [props.items]);

  const provinceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of props.items || []) {
      if (pickedRegion && getRegionName(it.city) !== pickedRegion) continue;
      const k = normTR(it.city);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [props.items, pickedRegion]);

  const districtCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (!pickedCity) return { type: "FeatureCollection", features: [] };

    const pickedK = normTR(pickedCity);
    const m = new Map<string, { districtRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();

    for (const it of props.items || []) {
      if (pickedK && normTR(it.city) !== pickedK) continue;
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
      id: `cnt_d_${normTR(pickedCity)}_${k}`,
      properties: {
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
  }, [props.items, pickedCity]);

  const neighborhoodCenters = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (!pickedCity || !pickedDistrict) return { type: "FeatureCollection", features: [] };

    const cityK = normTR(pickedCity);
    const distK = normTR(pickedDistrict);
    const m = new Map<string, { neighborhoodRaw: string; count: number; sumLng: number; sumLat: number; n: number }>();

    for (const it of props.items || []) {
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
      id: `cnt_n_${normTR(pickedCity)}_${normTR(pickedDistrict)}_${k}`,
      properties: {
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
  }, [props.items, pickedCity, pickedDistrict]);

  const activeProvinceGeo = useMemo(() => {
    if (!pickedRegion) return provGeo;
    return {
      type: "FeatureCollection" as const,
      features: (provGeo.features || []).filter((f: any) => safeStr(f?.properties?.region) === pickedRegion),
    };
  }, [provGeo, pickedRegion]);

  const activeDistrictGeo = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: (distGeo.features || []).filter((f: any) => sameTR(safeStr(f?.properties?.city), pickedCity)),
    };
  }, [distGeo, pickedCity]);

  const activePoly = useMemo(() => {
    if (level === "region" || level === "city") {
      return { src: SRC_PROV, fill: L_PROV_FILL, glow: L_PROV_GLOW, out: L_PROV_OUT };
    }
    if (level === "district") {
      return { src: SRC_DIST, fill: L_DIST_FILL, glow: L_DIST_GLOW, out: L_DIST_OUT };
    }
    return null;
  }, [level]);

  const countGeo = useMemo<FeatureCollection<Point, CountPointProps>>(() => {
    if (level === "region") return regionCenters;

    if (level === "city") {
      const features: Feature<Point, CountPointProps>[] = (activeProvinceGeo.features || [])
        .map((f: any) => {
          const name = safeStr(f?.properties?.name) || safeStr(f?.properties?.NAME_1);
          const center = centroidFromGeometry(f.geometry);
          if (!name || !center) return null;

          return {
            type: "Feature" as const,
            id: `cnt_city_${safeStr(f?.properties?.id) || normTR(name)}`,
            properties: {
              name,
              city: name,
              count: provinceCounts.get(normTR(name)) ?? 0,
              level: "city",
            },
            geometry: {
              type: "Point" as const,
              coordinates: center,
            },
          };
        })
        .filter(Boolean)
        .filter((x: any) => Number(x.properties?.count || 0) > 0) as Feature<Point, CountPointProps>[];

      return { type: "FeatureCollection", features };
    }

    if (level === "district") return districtCenters;
    if (level === "neighborhood") return neighborhoodCenters;

    return { type: "FeatureCollection", features: [] };
  }, [level, regionCenters, activeProvinceGeo, provinceCounts, districtCenters, neighborhoodCenters]);

  function fillPaintRegion() {
    return {
      "fill-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(109,224,255,0.18)",
        "rgba(245,215,110,0.06)",
      ],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.3,
        0.12,
      ],
    } as any;
  }

  function fillPaintDefault() {
    return {
      "fill-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(245,215,110,0.16)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.12)",
        "rgba(245,215,110,0.05)",
      ],
      "fill-opacity": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        0.32,
        ["boolean", ["feature-state", "hover"], false],
        0.24,
        0.12,
      ],
    } as any;
  }

  function glowPaintRegion() {
    return {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(109,224,255,0.95)",
        "rgba(109,224,255,0.28)",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        3.5,
        1.6,
      ],
      "line-blur": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        2.6,
        0.7,
      ],
      "line-opacity": 1,
    } as any;
  }

  function linePaintDefault() {
    return {
      "line-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(245,215,110,0.98)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.95)",
        "rgba(245,215,110,0.38)",
      ],
      "line-width": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        3.2,
        ["boolean", ["feature-state", "hover"], false],
        2.6,
        1.15,
      ],
      "line-blur": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        1.25,
        ["boolean", ["feature-state", "hover"], false],
        0.95,
        0.12,
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
        duration: 500,
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

  function goBack() {
    clearPointHover();
    clearPolyHover();
    setSelectedPolyId(null);

    if (level === "parcel") {
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");
      setLevel("neighborhood");
      return;
    }

    if (level === "neighborhood") {
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");
      setLevel("district");
      return;
    }

    if (level === "district") {
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("city");
      return;
    }

    if (level === "city") {
      setPickedCity("");
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetCity?.("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setPickedRegion("");
      setLevel("region");
    }
  }

  function handleCountNavigation(f: any) {
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

      const regionItems = (props.items || []).filter((it) => getRegionName(it.city) === nameRaw);
      zoomToItems(regionItems, 6.2);
      return;
    }

    if (level === "city") {
      const realCity = (props.items || []).find((it) => normTR(it.city) === normTR(nameRaw))?.city || nameRaw;

      setPickedCity(realCity);
      props.onSetCity?.(realCity);
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("district");

      const cityItems = (props.items || []).filter((it) => sameTR(it.city, realCity));
      zoomToItems(cityItems, 8.1);
      return;
    }

    if (level === "district") {
      const realDistrict =
        (props.items || [])
          .filter((it) => sameTR(it.city, pickedCity))
          .find((it) => normTR(it.district ?? "") === normTR(nameRaw))?.district || nameRaw;

      setPickedDistrict(String(realDistrict));
      props.onSetDistrict?.(String(realDistrict));
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");
      setLevel("neighborhood");

      const districtItems = (props.items || []).filter(
        (it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", realDistrict)
      );
      zoomToItems(districtItems, 10.9);
      return;
    }

    if (level === "neighborhood") {
      const realNeighborhood =
        (props.items || [])
          .filter((it) => sameTR(it.city, pickedCity))
          .filter((it) => sameTR(it.district ?? "", pickedDistrict))
          .find((it) => normTR(it.neighborhood ?? "") === normTR(nameRaw))?.neighborhood || nameRaw;

      setPickedNeighborhood(String(realNeighborhood));
      props.onSetNeighborhood?.(String(realNeighborhood));
      setLevel("parcel");

      const neighborhoodItems = (props.items || []).filter(
        (it) =>
          sameTR(it.city, pickedCity) &&
          sameTR(it.district ?? "", pickedDistrict) &&
          sameTR(it.neighborhood ?? "", realNeighborhood)
      );
      zoomToItems(neighborhoodItems, 13.3);
    }
  }

  function onMapClick(e: any) {
    const map = mapRef.current;
    if (!map) return;

    if (level !== "parcel") {
      const countHits = map.queryRenderedFeatures(e.point, { layers: [L_COUNT_PIN, L_COUNT_TEXT] });
      if (countHits && countHits.length > 0) {
        handleCountNavigation(countHits[0]);
        return;
      }
    }

    if (activePoly) {
      const hits = map.queryRenderedFeatures(e.point, { layers: [activePoly.fill, activePoly.out, activePoly.glow] });
      if (hits && hits.length > 0) {
        const f: any = hits[0];
        const geom = f.geometry;
        const p = f.properties || {};
        const id = String(p.id || f.id || "");
        if (id) setSelectedPolyId(id);

        if (level === "region") {
          const region = String(p.region || "").trim();
          if (region) {
            setPickedRegion(region);
            setPickedCity("");
            setPickedDistrict("");
            setPickedNeighborhood("");
            props.onSetCity?.("");
            props.onSetDistrict?.("");
            props.onSetNeighborhood?.("");
            setLevel("city");

            const regionItems = (props.items || []).filter((it) => getRegionName(it.city) === region);
            zoomToItems(regionItems, 6.2);
            return;
          }
        }

        if (level === "city") {
          const cityNameRaw = String(p.name || p.NAME_1 || "").trim();
          if (cityNameRaw) {
            const realCity =
              (props.items || []).find((it) => normTR(it.city) === normTR(cityNameRaw))?.city || cityNameRaw;

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
              (props.items || [])
                .filter((it) => sameTR(it.city, pickedCity))
                .find((it) => normTR(it.district ?? "") === normTR(districtNameRaw))?.district || districtNameRaw;

            setPickedDistrict(String(realDistrict));
            props.onSetDistrict?.(String(realDistrict));
            setPickedNeighborhood("");
            props.onSetNeighborhood?.("");
            setLevel("neighborhood");

            const districtItems = (props.items || []).filter(
              (it) => sameTR(it.city, pickedCity) && sameTR(it.district ?? "", realDistrict)
            );
            zoomToItems(districtItems, 10.9);
          }
          return;
        }
      }
    }

    if (level === "parcel") {
      const hits = map.queryRenderedFeatures(e.point, { layers: [L_CLUSTER_PIN, L_POINT] });
      if (!hits || hits.length === 0) return;

      const f: any = hits[0];
      const isCluster = !!(f.properties && f.properties.cluster);

      if (isCluster) {
        const clusterId = f.properties.cluster_id;
        const source: any = map.getSource(SRC_POINTS);
        if (!source) return;

        source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
          if (err) return;
          const [lng, lat] = f.geometry.coordinates;
          map.easeTo({ center: [lng, lat], zoom: Math.min(zoom, 16), duration: 450 });
        });
        return;
      }

      const id = String(f.properties?.id || "");
      if (!id) return;

      props.onSelectPropertyId?.(id);
      props.onOpenInfo?.();
    }
  }

  function onMouseMove(e: any) {
    const map = mapRef.current;
    if (!map) return;

    if (level !== "parcel") {
      const countHits = map.queryRenderedFeatures(e.point, { layers: [L_COUNT_PIN, L_COUNT_TEXT] });
      if (countHits && countHits.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        clearPolyHover();
        clearPointHover();
        return;
      }
    }

    if (activePoly) {
      const hits = map.queryRenderedFeatures(e.point, { layers: [activePoly.fill, activePoly.out, activePoly.glow] });
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
      } else {
        if (hoverPolyId) {
          try {
            map.setFeatureState({ source: activePoly.src, id: hoverPolyId }, { hover: false });
          } catch {}
          setHoverPolyId(null);
        }
      }
    }

    if (level === "parcel") {
      const hits = map.queryRenderedFeatures(e.point, { layers: [L_CLUSTER_PIN, L_POINT] });
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

      const pid = String(f.properties?.id || "");
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
    if (level === "region") return `${props.items.length} arsa • bölgesel görünüm`;
    if (level === "city") {
      const count = (props.items || []).filter((x) => (!pickedRegion ? true : getRegionName(x.city) === pickedRegion)).length;
      return `${count} arsa • il görünümü`;
    }
    if (level === "district") {
      const count = (props.items || []).filter((x) => sameTR(x.city, pickedCity)).length;
      return `${count} arsa • ilçe görünümü`;
    }
    if (level === "neighborhood") {
      const count = (props.items || []).filter(
        (x) => sameTR(x.city, pickedCity) && sameTR(x.district ?? "", pickedDistrict)
      ).length;
      return `${count} arsa • mahalle görünümü`;
    }
    return `${itemsFiltered.length} arsa • parsel görünümü`;
  }, [level, props.items, pickedRegion, pickedCity, pickedDistrict, itemsFiltered.length]);

  const interactiveLayers = useMemo(() => {
    const arr: string[] = [];
    if (activePoly) arr.push(activePoly.fill, activePoly.glow, activePoly.out);
    arr.push(L_COUNT_PIN, L_COUNT_TEXT);
    if (level === "parcel") arr.push(L_CLUSTER_PIN, L_POINT);
    return arr;
  }, [activePoly, level]);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16, color: "white" }}>
        MAPBOX TOKEN yok: <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>
      </div>
    );
  }

  const countPinLayer: any = {
    id: L_COUNT_PIN,
    type: "symbol",
    source: SRC_COUNT,
    layout: {
      "icon-image": "marker-15",
      "icon-size": [
        "step",
        ["get", "count"],
        1.8,
        20,
        2.05,
        60,
        2.25,
        150,
        2.5,
        300,
        2.8,
      ],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["to-string", ["get", "count"]],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": [
        "step",
        ["get", "count"],
        11,
        20,
        12,
        60,
        13,
        150,
        14,
        300,
        15,
      ],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-anchor": "center",
      "text-offset": [0, -0.75],
    },
    paint: {
      "icon-color": "#D0A42B",
      "icon-halo-color": "rgba(0,0,0,0.65)",
      "icon-halo-width": 1.25,
      "icon-opacity": 0.98,
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.45)",
      "text-halo-width": 1.1,
    },
  };

  const countTextLayer: any = {
    id: L_COUNT_TEXT,
    type: "symbol",
    source: SRC_COUNT,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, 0.35],
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": "rgba(255,255,255,0.86)",
      "text-halo-color": "rgba(8,12,22,0.92)",
      "text-halo-width": 1.2,
    },
  };

  const clusterPinLayer: any = {
    id: L_CLUSTER_PIN,
    type: "symbol",
    source: SRC_POINTS,
    filter: ["has", "point_count"],
    layout: {
      "icon-image": "marker-15",
      "icon-size": [
        "step",
        ["get", "point_count"],
        1.65,
        25,
        1.9,
        75,
        2.15,
        150,
        2.35,
        300,
        2.65,
      ],
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-anchor": "center",
      "text-offset": [0, -0.75],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "icon-color": "#D0A42B",
      "icon-halo-color": "rgba(8,12,22,0.88)",
      "icon-halo-width": 1.3,
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.42)",
      "text-halo-width": 1.1,
    },
  };

  const clusterTextLayer: any = {
    id: L_CLUSTER_TEXT,
    type: "symbol",
    source: SRC_POINTS,
    filter: ["has", "point_count"],
    layout: {
      "text-field": "",
    },
  };

  const pointLayer: any = {
    id: L_POINT,
    type: "circle",
    source: SRC_POINTS,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 8.8, 5.8],
      "circle-color": "rgba(8,12,22,0.86)",
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,1)",
        "rgba(201,162,39,0.86)",
      ],
      "circle-stroke-width": 2.2,
      "circle-opacity": 0.98,
      "circle-blur": ["case", ["boolean", ["feature-state", "hover"], false], 0.78, 0.14],
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
          <div style={{ fontWeight: 1000, letterSpacing: 0.2 }}>{badgeText}</div>
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
            title="Geri"
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
        initialViewState={{ longitude: 35.0, latitude: 39.0, zoom: 5.2 }}
        minZoom={3}
        maxZoom={17}
        onClick={onMapClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        interactiveLayerIds={interactiveLayers}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />

        {(level === "region" || level === "city") && (
          <Source id={SRC_PROV} type="geojson" data={level === "region" ? provGeo : activeProvinceGeo} promoteId="id">
            <Layer id={L_PROV_FILL} type="fill" paint={level === "region" ? fillPaintRegion() : fillPaintDefault()} />
            <Layer id={L_PROV_GLOW} type="line" paint={level === "region" ? glowPaintRegion() : linePaintDefault()} />
            <Layer
              id={L_PROV_OUT}
              type="line"
              paint={{
                "line-color": level === "region" ? "rgba(255,255,255,0.18)" : "rgba(245,215,110,0.48)",
                "line-width": level === "region" ? 0.8 : 1.1,
                "line-opacity": 1,
              }}
            />
          </Source>
        )}

        {level === "district" && (
          <Source id={SRC_DIST} type="geojson" data={activeDistrictGeo} promoteId="id">
            <Layer id={L_DIST_FILL} type="fill" paint={fillPaintDefault()} />
            <Layer id={L_DIST_GLOW} type="line" paint={linePaintDefault()} />
            <Layer
              id={L_DIST_OUT}
              type="line"
              paint={{
                "line-color": "rgba(245,215,110,0.48)",
                "line-width": 1.1,
                "line-opacity": 1,
              }}
            />
          </Source>
        )}

        {level !== "parcel" && (
          <Source id={SRC_COUNT} type="geojson" data={countGeo}>
            <Layer {...countPinLayer} />
            <Layer {...countTextLayer} />
          </Source>
        )}

        {level === "parcel" && (
          <Source
            id={SRC_POINTS}
            type="geojson"
            data={pointsGeo as any}
            cluster={true}
            clusterRadius={50}
            clusterMaxZoom={13}
            promoteId={"id" as any}
          >
            <Layer {...clusterPinLayer} />
            <Layer {...clusterTextLayer} />
            <Layer {...pointLayer} />
          </Source>
        )}
      </MapGL>
    </div>
  );
}