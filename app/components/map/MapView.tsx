"use client";

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

type Level = "city" | "district" | "parcel";

function safeStr(x: any) {
  return typeof x === "string" ? x : "";
}

// ✅ TR normalize: İstanbul/Istanbul, Şanlıurfa/Sanliurfa vb. eşleşsin
function normTR(s: any) {
  const x = (typeof s === "string" ? s : "").trim().toLowerCase();
  return x
    .replaceAll("İ", "i")
    .replaceAll("I", "i")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}
function sameTR(a: any, b: any) {
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
    if (Array.isArray(c) && c.length > 0) pushRing(c[0]);
  } else if (t === "MultiPolygon") {
    if (Array.isArray(c)) {
      for (const poly of c) {
        if (Array.isArray(poly) && poly.length > 0) pushRing(poly[0]);
      }
    }
  }

  return out;
}

function bboxFromGeometry(geom: any) {
  const pts = coordsFromGeometry(geom);
  if (pts.length === 0) return null;

  let minLng = pts[0][0],
    minLat = pts[0][1],
    maxLng = pts[0][0],
    maxLat = pts[0][1];

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
  let sx = 0,
    sy = 0,
    n = 0;
  for (const [lng, lat] of pts) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    sx += lng;
    sy += lat;
    n++;
  }
  if (!n) return null;
  return [sx / n, sy / n] as [number, number];
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

  // ✅ “İller önce”
  const [level, setLevel] = useState<Level>("city");
  const [pickedCity, setPickedCity] = useState<string>("");
  const [pickedDistrict, setPickedDistrict] = useState<string>("");

  // GeoJSON’lar (public’ten okunuyor)
  const [provGeo, setProvGeo] = useState<any>({ type: "FeatureCollection", features: [] });
  const [distGeo, setDistGeo] = useState<any>({ type: "FeatureCollection", features: [] });

  // Hover/select state
  const [hoverPolyId, setHoverPolyId] = useState<string | null>(null);
  const [selectedPolyId, setSelectedPolyId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  // IDs
  const SRC_PROV = "src-prov";
  const SRC_DIST = "src-dist";
  const SRC_COUNT = "src-count";
  const SRC_POINTS = "src-points";

  const L_PROV_FILL = "prov-fill";
  const L_PROV_OUT = "prov-out";
  const L_DIST_FILL = "dist-fill";
  const L_DIST_OUT = "dist-out";

  // ✅ Balon (arsa adedi) layerları
  const L_COUNT_DROPLET = "count-droplet";
  const L_COUNT_TEXT = "count-text";

  const L_CLUSTER = "clusters";
  const L_CLUSTER_TEXT = "cluster-text";
  const L_POINT = "point";

  // Colors
  const GOLD = "#F5D76E";

  // ---------- LOAD GEOJSON ----------
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
          return {
            ...f,
            id,
            properties: { ...(f.properties || {}), id, name, city: name },
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
            properties: { ...(f.properties || {}), id, name: district, city, district },
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

  // ---------- ITEMS FILTER ----------
  const itemsFiltered = useMemo(() => {
    let arr = props.items || [];
    if (pickedCity) arr = arr.filter((x) => sameTR(x.city, pickedCity));
    if (pickedDistrict) arr = arr.filter((x) => sameTR(x.district ?? "", pickedDistrict));
    return arr;
  }, [props.items, pickedCity, pickedDistrict]);

  // ---------- POINTS GEOJSON ----------
  const pointsGeo = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: (itemsFiltered || [])
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => ({
          type: "Feature" as const,
          id: p.id,
          geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
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

  // ---------- COUNTS (normalize key) ----------
  const provinceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of props.items || []) {
      const k = normTR(it.city);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [props.items]);

  const districtCounts = useMemo(() => {
    const m = new Map<string, number>();
    const pickedK = normTR(pickedCity);

    for (const it of props.items || []) {
      if (pickedK && normTR(it.city) !== pickedK) continue;

      const d = (it.district ?? "").trim();
      const dk = normTR(d);
      if (!dk) continue;

      m.set(dk, (m.get(dk) ?? 0) + 1);
    }
    return m;
  }, [props.items, pickedCity]);

  // İlçe balonlarını items’tan üret (isim uyuşmazlığı olmasın) ✅ normalize
  const districtCentersFromItems = useMemo(() => {
    if (!pickedCity) return { type: "FeatureCollection", features: [] as any[] };

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
      cur.districtRaw = cur.districtRaw || dRaw;
      m.set(dK, cur);
    }

    const features = Array.from(m.entries()).map(([districtKey, v]) => ({
      type: "Feature",
      id: `cnt_itemdist_${normTR(pickedCity)}_${districtKey}`,
      properties: { name: v.districtRaw, count: v.count, district: v.districtRaw },
      geometry: { type: "Point", coordinates: [v.sumLng / v.n, v.sumLat / v.n] },
    }));

    return { type: "FeatureCollection", features };
  }, [props.items, pickedCity]);

  // ---------- ACTIVE POLY ----------
  const activePoly = useMemo(() => {
    if (level === "city") return { src: SRC_PROV, geo: provGeo, fill: L_PROV_FILL, out: L_PROV_OUT };

    if (level === "district") {
      const filtered = {
        type: "FeatureCollection",
        features: (distGeo.features || []).filter((f: any) => sameTR(safeStr(f?.properties?.city), pickedCity)),
      };
      return { src: SRC_DIST, geo: filtered, fill: L_DIST_FILL, out: L_DIST_OUT };
    }

    return null;
  }, [level, provGeo, distGeo, pickedCity]);

  // ---------- COUNT GEO (arsa adedi balonu) ----------
  const countGeo = useMemo(() => {
    // İL seviyesinde: polygon centroid’e balon
    if (level === "city") {
      const features = (provGeo.features || [])
        .map((f: any) => {
          const name = safeStr(f?.properties?.name) || safeStr(f?.properties?.NAME_1);
          const center = centroidFromGeometry(f.geometry);
          if (!name || !center) return null;

          const count = provinceCounts.get(normTR(name)) ?? 0;

          return {
            type: "Feature",
            id: `cnt_city_${safeStr(f?.properties?.id) || normTR(name)}`,
            properties: { name, count },
            geometry: { type: "Point", coordinates: center },
          };
        })
        .filter(Boolean);

      return { type: "FeatureCollection", features };
    }

    // İLÇE seviyesinde: items’tan merkez üret (en sağlam)
    if (level === "district") {
      if (districtCentersFromItems.features.length > 0) return districtCentersFromItems;

      // fallback: polygon centroid
      const feats = (distGeo.features || [])
        .filter((f: any) => sameTR(safeStr(f?.properties?.city), pickedCity))
        .map((f: any) => {
          const name = safeStr(f?.properties?.name) || safeStr(f?.properties?.NAME_2);
          const center = centroidFromGeometry(f.geometry);
          if (!name || !center) return null;

          const count = districtCounts.get(normTR(name)) ?? 0;

          return {
            type: "Feature",
            id: `cnt_dist_${safeStr(f?.properties?.id) || normTR(name)}`,
            properties: { name, count, district: name },
            geometry: { type: "Point", coordinates: center },
          };
        })
        .filter(Boolean);

      return { type: "FeatureCollection", features: feats };
    }

    return { type: "FeatureCollection", features: [] };
  }, [level, provGeo, distGeo, pickedCity, provinceCounts, districtCounts, districtCentersFromItems]);

  // ---------- STYLE (NEON POLY) ----------
  function fillPaint() {
    return {
      "fill-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(245,215,110,0.20)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.16)",
        "rgba(245,215,110,0.06)",
      ],
    } as any;
  }

  function linePaint() {
    return {
      "line-color": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        "rgba(245,215,110,0.98)",
        ["boolean", ["feature-state", "hover"], false],
        "rgba(245,215,110,0.92)",
        "rgba(245,215,110,0.35)",
      ],
      "line-width": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        3,
        ["boolean", ["feature-state", "hover"], false],
        3,
        1.4,
      ],
      "line-blur": [
        "case",
        ["==", ["get", "id"], selectedPolyId ?? ""],
        1.0,
        ["boolean", ["feature-state", "hover"], false],
        0.9,
        0.2,
      ],
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

  function zoomToGeometry(geom: any) {
    const map = mapRef.current;
    if (!map) return;
    const bb = bboxFromGeometry(geom);
    if (!bb) return;
    map.fitBounds(
      [
        [bb.minLng, bb.minLat],
        [bb.maxLng, bb.maxLat],
      ],
      { padding: 60, duration: 650 }
    );
  }

  function goBack() {
    clearPointHover();
    clearPolyHover();
    setSelectedPolyId(null);

    if (level === "parcel") {
      setLevel("district");
      return;
    }
    if (level === "district") {
      setPickedDistrict("");
      props.onSetDistrict?.("");
      setPickedCity("");
      props.onSetCity?.("");
      setLevel("city");
      return;
    }
  }

  // ---------- CLICK / HOVER ----------
  async function onMapClick(e: any) {
    const map = mapRef.current;
    if (!map) return;

    // ✅ 0) Önce balona tıklama
    if (level === "city" || level === "district") {
      const countHits = map.queryRenderedFeatures(e.point, { layers: [L_COUNT_DROPLET, L_COUNT_TEXT] });
      if (countHits && countHits.length > 0) {
        const f: any = countHits[0];
        const nameRaw = String(f.properties?.name || "").trim();
        if (!nameRaw) return;

        if (level === "city") {
          // ✅ geojson adı farklı olsa bile items içinden gerçek şehri bul
          const realCity =
            (props.items || []).find((it) => normTR(it.city) === normTR(nameRaw))?.city || nameRaw;

          setPickedCity(realCity);
          props.onSetCity?.(realCity);

          setPickedDistrict("");
          props.onSetDistrict?.("");
          setLevel("district");

          const [lng, lat] = f.geometry.coordinates;
          map.easeTo({ center: [lng, lat], zoom: 7.7, duration: 520 });
          return;
        }

        if (level === "district") {
          // ✅ pickedCity içinde gerçek ilçe adını bul
          const realDistrict =
            (props.items || [])
              .filter((it) => sameTR(it.city, pickedCity))
              .find((it) => normTR(it.district ?? "") === normTR(nameRaw))?.district || nameRaw;

          setPickedDistrict(String(realDistrict));
          props.onSetDistrict?.(String(realDistrict));
          setLevel("parcel");

          const [lng, lat] = f.geometry.coordinates;
          map.easeTo({ center: [lng, lat], zoom: 10.6, duration: 520 });
          return;
        }
      }
    }

    // 1) polygon click (il/ilçe alanı)
    if (activePoly) {
      const hits = map.queryRenderedFeatures(e.point, { layers: [activePoly.fill, activePoly.out] });
      if (hits && hits.length > 0) {
        const f: any = hits[0];
        const geom = f.geometry;
        const p = f.properties || {};
        const id = String(p.id || f.id || "");
        if (id) setSelectedPolyId(id);
        if (geom) zoomToGeometry(geom);

        if (level === "city") {
          const cityNameRaw = String(p.name || p.NAME_1 || "").trim();
          if (cityNameRaw) {
            const realCity =
              (props.items || []).find((it) => normTR(it.city) === normTR(cityNameRaw))?.city || cityNameRaw;

            setPickedCity(realCity);
            props.onSetCity?.(realCity);
          }
          setPickedDistrict("");
          props.onSetDistrict?.("");
          setLevel("district");
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
          }
          setLevel("parcel");
          return;
        }
      }
    }

    // 2) parcel points click
    if (level === "parcel") {
      const hits = map.queryRenderedFeatures(e.point, { layers: [L_CLUSTER, L_POINT] });
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
      return;
    }
  }

  function onMouseMove(e: any) {
    const map = mapRef.current;
    if (!map) return;

    // ✅ Balon hover (cursor pointer)
    if (level === "city" || level === "district") {
      const countHits = map.queryRenderedFeatures(e.point, { layers: [L_COUNT_DROPLET, L_COUNT_TEXT] });
      if (countHits && countHits.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        clearPolyHover();
        clearPointHover();
        return;
      }
    }

    // polygon hover
    if (activePoly) {
      const hits = map.queryRenderedFeatures(e.point, { layers: [activePoly.fill, activePoly.out] });
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

    // point hover (parcel)
    if (level === "parcel") {
      const hits = map.queryRenderedFeatures(e.point, { layers: [L_CLUSTER, L_POINT] });
      if (!hits || hits.length === 0) {
        map.getCanvas().style.cursor = "";
        clearPointHover();
        return;
      }

      map.getCanvas().style.cursor = "pointer";
      const f: any = hits[0];
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

  // ---------- UI ----------
  const badgeText = useMemo(() => {
    if (level === "city") return "İller";
    if (level === "district") return `İlçeler • ${pickedCity || "—"}`;
    if (level === "parcel") return pickedDistrict ? `Arsalar • ${pickedCity} / ${pickedDistrict}` : `Arsalar • ${pickedCity}`;
    return "";
  }, [level, pickedCity, pickedDistrict]);

  const interactiveLayers = useMemo(() => {
    const arr: string[] = [];
    if (activePoly) arr.push(activePoly.fill, activePoly.out);
    arr.push(L_COUNT_DROPLET, L_COUNT_TEXT);
    if (level === "parcel") arr.push(L_CLUSTER, L_POINT);
    return arr;
  }, [activePoly, level]);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16, color: "white" }}>
        MAPBOX TOKEN yok: <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>
      </div>
    );
  }

  // ---------- CLUSTER/POINT STYLES ----------
  const clusterLayer: any = {
    id: L_CLUSTER,
    type: "circle",
    source: SRC_POINTS,
    filter: ["has", "point_count"],
    paint: {
      "circle-radius": ["step", ["get", "point_count"], 16, 50, 20, 150, 24, 300, 28],
      "circle-color": "rgba(10,14,24,0.55)",
      "circle-stroke-color": GOLD,
      "circle-stroke-width": 2,
      "circle-opacity": 0.95,
      "circle-blur": ["case", ["boolean", ["feature-state", "hover"], false], 0.6, 0.12],
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
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.35)",
      "text-halo-width": 1,
    },
  };

  const pointLayer: any = {
    id: L_POINT,
    type: "circle",
    source: SRC_POINTS,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 7, 5],
      "circle-color": "rgba(10,14,24,0.70)",
      "circle-stroke-color": ["case", ["boolean", ["feature-state", "hover"], false], "rgba(245,215,110,0.98)", "rgba(201,162,39,0.85)"],
      "circle-stroke-width": 2,
      "circle-opacity": 0.98,
      "circle-blur": ["case", ["boolean", ["feature-state", "hover"], false], 0.7, 0.12],
    },
  };

  const countDropletLayer: any = {
    id: L_COUNT_DROPLET,
    type: "circle",
    source: SRC_COUNT,
    paint: {
      "circle-radius": ["step", ["get", "count"], 12, 50, 13.5, 200, 15, 500, 16.5],
      "circle-color": "rgba(10,14,24,0.70)",
      "circle-stroke-color": "rgba(245,215,110,0.98)",
      "circle-stroke-width": 2.2,
      "circle-opacity": 0.98,
      "circle-blur": 0.12,
    },
  };

  const countTextLayer: any = {
    id: L_COUNT_TEXT,
    type: "symbol",
    source: SRC_COUNT,
    layout: {
      "text-field": ["to-string", ["get", "count"]],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-anchor": "center",
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0,0,0,0.45)",
      "text-halo-width": 1.2,
    },
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/* Üst mini bar */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 5,
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "10px 12px",
          borderRadius: 16,
          background: "rgba(10,14,24,0.55)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(10px)",
          color: "white",
        }}
      >
        <div style={{ fontWeight: 1000, letterSpacing: 0.2 }}>{badgeText}</div>

        {level !== "city" && (
          <button
            onClick={goBack}
            style={{
              marginLeft: 10,
              padding: "8px 10px",
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
        ref={(r) => (mapRef.current = r)}
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

        {/* Polygon: İller */}
        {level === "city" && (
          <Source id={SRC_PROV} type="geojson" data={provGeo} promoteId="id">
            <Layer id={L_PROV_FILL} type="fill" paint={fillPaint()} />
            <Layer id={L_PROV_OUT} type="line" paint={linePaint()} />
          </Source>
        )}

        {/* Polygon: İlçeler */}
        {level === "district" && activePoly && (
          <Source id={SRC_DIST} type="geojson" data={activePoly.geo} promoteId="id">
            <Layer id={L_DIST_FILL} type="fill" paint={fillPaint()} />
            <Layer id={L_DIST_OUT} type="line" paint={linePaint()} />
          </Source>
        )}

        {/* ✅ Arsa adedi balonları (İL / İLÇE) */}
        {(level === "city" || level === "district") && (
          <Source id={SRC_COUNT} type="geojson" data={countGeo}>
            <Layer {...countDropletLayer} />
            <Layer {...countTextLayer} />
          </Source>
        )}

        {/* Arsalar */}
        {level === "parcel" && (
          <Source
            id={SRC_POINTS}
            type="geojson"
            data={pointsGeo as any}
            cluster={true}
            clusterRadius={50}
            clusterMaxZoom={11}
            promoteId={"id" as any}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterTextLayer} />
            <Layer {...pointLayer} />
          </Source>
        )}
      </MapGL>
    </div>
  );
}