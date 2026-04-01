import type { RefObject } from "react";
import type { FeatureCollection } from "geojson";
import type { MapRef } from "react-map-gl/mapbox";
import {
  bboxFromGeometry,
  centroidFromGeometry,
  findDistrictFeatureRobust,
  mapItemWithParsedCoords,
  normTR,
} from "./map.data";
import { getBoundsCenter, isValidBounds, normalizeBounds, type BBoxLike } from "./map.cameraBounds";
import type { MapItem } from "./map.types";

function safeStr(x: unknown) {
  return typeof x === "string" ? x : "";
}

/** Türkiye başlangıç */
export const TURKEY_CENTER: [number, number] = [35.2, 39.1];
export const TURKEY_ZOOM = 4.8;

const FIT_PADDING = { top: 110, right: 80, bottom: 80, left: 80 };
const FIT_DURATION = 1100;

const MAX_Z = {
  region: 6.2,
  city: 7.8,
  district: 9.5,
  neighborhood: 11.8,
} as const;

export type CameraFitLevel = keyof typeof MAX_Z;

const PARCEL_ZOOM = 14.2;

const WIDE_SPAN_DEG = 18;

export type FocusOpts = { force?: boolean };

export function useMapCamera(
  mapRef: RefObject<MapRef | null>,
  geo: { provGeo: FeatureCollection; distGeo: FeatureCollection }
) {
  const { provGeo, distGeo } = geo;
  const lastFocusKeyRef = { current: null as string | null };

  function getMap() {
    return mapRef.current?.getMap() ?? null;
  }

  function canFocus(key: string, opts?: FocusOpts): boolean {
    if (opts?.force) return true;
    return lastFocusKeyRef.current !== key;
  }

  function markFocus(key: string) {
    lastFocusKeyRef.current = key;
  }

  function flyToSmooth(
    center: [number, number],
    zoom: number,
    key: string,
    opts?: FocusOpts
  ): boolean {
    if (!canFocus(key, opts)) return false;
    const map = getMap();
    if (!map) return false;
    markFocus(key);
    map.flyTo({
      center,
      zoom,
      duration: FIT_DURATION,
      pitch: 0,
      bearing: 0,
      essential: true,
    });
    return true;
  }

  function fitBoundsLevel(
    level: CameraFitLevel,
    boundsInput: BBoxLike,
    key: string,
    logLabel: string,
    opts?: FocusOpts
  ): boolean {
    if (!canFocus(key, opts)) return false;
    const map = getMap();
    if (!map) return false;

    const norm = normalizeBounds(boundsInput);
    if (!norm) {
      console.log("[camera] invalid bounds fallback — normalize failed", logLabel);
      return false;
    }
    const [sw, ne] = norm;
    if (!isValidBounds(sw, ne)) {
      const c = getBoundsCenter(sw, ne);
      console.log("[camera] invalid bounds fallback — flyTo center", logLabel);
      return flyToSmooth(c, MAX_Z[level], key, opts);
    }

    const maxZoom = MAX_Z[level];
    const zBefore = map.getZoom();
    markFocus(key);

    map.fitBounds(norm, {
      padding: FIT_PADDING,
      duration: FIT_DURATION,
      maxZoom,
      essential: true,
    });

    map.once("moveend", () => {
      const zAfter = map.getZoom();
      if (zAfter < zBefore - 0.08) {
        map.easeTo({
          zoom: Math.min(maxZoom, zBefore),
          center: map.getCenter(),
          duration: 450,
          essential: true,
        });
      }
    });

    console.log(`[camera] ${logLabel}`, { key, maxZoom });
    return true;
  }

  function focusTurkey(opts?: FocusOpts): boolean {
    const key = "turkey:home";
    if (!canFocus(key, opts)) return false;
    const map = getMap();
    if (!map) return false;
    markFocus(key);
    map.flyTo({
      center: TURKEY_CENTER,
      zoom: TURKEY_ZOOM,
      pitch: 0,
      bearing: 0,
      duration: FIT_DURATION,
      essential: true,
    });
    console.log("[camera] focusTurkey");
    return true;
  }

  function focusRegion(bounds: BBoxLike, key: string, opts?: FocusOpts): boolean {
    return fitBoundsLevel("region", bounds, key, "focusRegion", opts);
  }

  function focusCity(bounds: BBoxLike, key: string, opts?: FocusOpts): boolean {
    return fitBoundsLevel("city", bounds, key, "focusCity", opts);
  }

  function focusDistrict(bounds: BBoxLike, key: string, opts?: FocusOpts): boolean {
    return fitBoundsLevel("district", bounds, key, "focusDistrict", opts);
  }

  function focusNeighborhood(bounds: BBoxLike, key: string, opts?: FocusOpts): boolean {
    return fitBoundsLevel("neighborhood", bounds, key, "focusNeighborhood", opts);
  }

  function focusParcel(center: [number, number], key: string, opts?: FocusOpts): boolean {
    if (!canFocus(key, opts)) return false;
    const map = getMap();
    if (!map) return false;
    markFocus(key);
    map.flyTo({
      center,
      zoom: PARCEL_ZOOM,
      duration: FIT_DURATION,
      pitch: 0,
      bearing: 0,
      essential: true,
    });
    console.log("[camera] focusParcel", key);
    return true;
  }

  /** GADM: bölge adına göre il poligonlarının birleşik bbox'ı */
  function focusRegionByProvinceName(regionName: string, opts?: FocusOpts): boolean {
    const key = `region:${normTR(regionName)}`;
    const feats = (provGeo.features || []).filter(
      (f) => safeStr((f as { properties?: { region?: string } }).properties?.region) === regionName
    );
    if (!feats.length) return false;
    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;
    for (const f of feats) {
      const bb = bboxFromGeometry((f as { geometry?: unknown }).geometry as { coordinates?: unknown });
      if (!bb) continue;
      minLng = Math.min(minLng, bb.minLng);
      minLat = Math.min(minLat, bb.minLat);
      maxLng = Math.max(maxLng, bb.maxLng);
      maxLat = Math.max(maxLat, bb.maxLat);
    }
    if (!Number.isFinite(minLng) || minLng === Infinity) return false;
    return focusRegion(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      key,
      opts
    );
  }

  /** Tek il poligonu (GADM il) */
  function focusCityByProvinceName(cityName: string, opts?: FocusOpts): boolean {
    const key = `city:${normTR(cityName)}`;
    const feat = (provGeo.features || []).find((f) => {
      const p = (f as { properties?: Record<string, unknown> }).properties;
      const n = safeStr(p?.name) || safeStr(p?.NAME_1);
      return normTR(n) === normTR(cityName);
    });
    if (!feat?.geometry) return false;
    const bb = bboxFromGeometry((feat as { geometry: { coordinates?: unknown } }).geometry);
    if (!bb) return false;
    const bounds: BBoxLike = [
      [bb.minLng, bb.minLat],
      [bb.maxLng, bb.maxLat],
    ];
    return focusCity(bounds, key, opts);
  }

  function focusDistrictFromGADM(
    cityName: string,
    districtName: string,
    clickedGeom: unknown | null | undefined,
    opts?: FocusOpts
  ): boolean {
    const key = `district:${normTR(cityName)}-${normTR(districtName)}`;
    let geom: unknown = null;
    const cg = clickedGeom as { type?: string } | undefined;
    if (
      cg &&
      (cg.type === "Polygon" ||
        cg.type === "MultiPolygon" ||
        cg.type === "LineString" ||
        cg.type === "MultiLineString")
    ) {
      geom = clickedGeom;
    }
    if (!geom) {
      const feat = findDistrictFeatureRobust(distGeo, cityName, districtName);
      geom = feat?.geometry ?? null;
    }
    if (!geom) return false;
    const bb = bboxFromGeometry(geom as { coordinates?: unknown });
    if (bb && bb.maxLng - bb.minLng > 1e-7 && bb.maxLat - bb.minLat > 1e-7) {
      return focusDistrict(
        [
          [bb.minLng, bb.minLat],
          [bb.maxLng, bb.maxLat],
        ],
        key,
        opts
      );
    }
    const c = centroidFromGeometry(geom as { coordinates?: unknown });
    if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
      console.log("[camera] focusDistrict — invalid bbox, centroid fallback", key);
      return flyToSmooth([c[0], c[1]], MAX_Z.district, key, opts);
    }
    return false;
  }

  /** Tıklanan poligon geometrisi → seviye maxZoom ile fit */
  function focusClickedPolygon(geom: unknown, level: CameraFitLevel, key: string, opts?: FocusOpts): boolean {
    const bb = bboxFromGeometry(geom as { coordinates?: unknown });
    if (!bb) return false;
    const bounds: BBoxLike = [
      [bb.minLng, bb.minLat],
      [bb.maxLng, bb.maxLat],
    ];
    return fitBoundsLevel(level, bounds, key, `focusClickedPolygon:${level}`, opts);
  }

  /** İlan noktalarından bbox; çok geniş span’da centroid + sınırlı zoom */
  function focusFromItems(items: MapItem[], level: CameraFitLevel | "parcel", key: string, opts?: FocusOpts): boolean {
    const pts = items.map(mapItemWithParsedCoords).filter((x): x is MapItem => x !== null);
    if (!pts.length) return false;

    if (pts.length === 1) {
      const z = level === "parcel" ? PARCEL_ZOOM : MAX_Z[level as CameraFitLevel];
      return flyToSmooth([pts[0].longitude, pts[0].latitude], z, key, opts);
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

    if (spanDeg > WIDE_SPAN_DEG || spanLng > 35 || spanLat > 22) {
      let cx = 0,
        cy = 0;
      for (const p of pts) {
        cx += p.longitude;
        cy += p.latitude;
      }
      cx /= pts.length;
      cy /= pts.length;
      const cap =
        level === "parcel"
          ? Math.min(PARCEL_ZOOM, 8.5)
          : Math.min(MAX_Z[level as CameraFitLevel], 8.2);
      console.log("[camera] focusFromItems — wide span, centroid", key);
      return flyToSmooth([cx, cy], cap, key, opts);
    }

    if (level === "parcel") {
      return focusNeighborhood(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        key,
        opts
      );
    }

    return fitBoundsLevel(
      level as CameraFitLevel,
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      key,
      "focusFromItems",
      opts
    );
  }

  return {
    focusTurkey,
    focusRegion,
    focusCity,
    focusDistrict,
    focusNeighborhood,
    focusParcel,
    focusRegionByProvinceName,
    focusCityByProvinceName,
    focusDistrictFromGADM,
    focusClickedPolygon,
    focusFromItems,
    /** Test / zorunlu yeniden odak */
    resetFocusKey: () => {
      lastFocusKeyRef.current = null;
    },
    getLastFocusKey: () => lastFocusKeyRef.current,
  };
}
