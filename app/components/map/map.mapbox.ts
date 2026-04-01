import type { RefObject } from "react";
import type { MapRef } from "react-map-gl/mapbox";
import { PROPERTY_POINT_LAYER_IDS } from "./map.config";

type MapboxMapLike = {
  isStyleLoaded?: () => boolean;
  getSource?: (id: string) => unknown;
  setFeatureState?: (args: { source: string; id: string | number }, state: { hover?: boolean }) => void;
};

function getUnderlyingMap(mapRef: MapRef | null): MapboxMapLike | null {
  if (!mapRef) return null;
  const inner = (mapRef as unknown as { getMap?: () => unknown }).getMap?.();
  if (!inner) return null;
  const m = inner as MapboxMapLike;
  if (typeof m.setFeatureState !== "function") return null;
  return m;
}

/** Stil ve kaynaklar hazır mı (setFeatureState / query öncesi) */
export function isMapStyleReady(mapRef: MapRef | null): boolean {
  const m = getUnderlyingMap(mapRef);
  if (!m) return false;
  try {
    return typeof m.isStyleLoaded === "function" && m.isStyleLoaded();
  } catch {
    return false;
  }
}

/**
 * setFeatureState öncesi source varlığını doğrular; yoksa veya hata olursa crash etmez.
 * hover: false başarılı olursa [hover] clear … loglanır.
 */
export function safeSetFeatureHover(
  mapRef: MapRef | null,
  sourceName: string | null | undefined,
  featureId: string | number | null | undefined,
  hover: boolean
): void {
  if (!mapRef) return;
  const src = String(sourceName ?? "").trim();
  if (!src) return;
  if (featureId == null || featureId === "") return;
  const m = getUnderlyingMap(mapRef);
  if (!m) return;
  try {
    if (typeof m.isStyleLoaded === "function" && !m.isStyleLoaded()) return;
    if (typeof m.getSource !== "function" || !m.getSource(src)) {
      console.warn(`[hover] source missing, skip clear: ${src}`);
      return;
    }
    if (typeof m.setFeatureState !== "function") return;
    m.setFeatureState({ source: src, id: featureId }, { hover });
    if (!hover) {
      console.log(`[hover] clear ${src} ${featureId}`);
    }
  } catch {
    console.warn(`[hover] source missing, skip clear: ${src}`);
  }
}

export function safeClearFeatureHover(
  mapRef: MapRef | null,
  sourceName: string | null | undefined,
  featureId: string | number | null | undefined
): void {
  safeSetFeatureHover(mapRef, sourceName, featureId, false);
}

export type MapboxLike = {
  fitBounds: (b: [[number, number], [number, number]], o: object) => void;
  flyTo: (o: object) => void;
  easeTo: (o: object) => void;
  getZoom: () => number;
  getCenter: () => { lng: number; lat: number };
  once: (ev: string, fn: () => void) => void;
};

export function getMapboxInstance(map: MapRef | null): MapboxLike | null {
  if (!map) return null;
  const inner = (map as unknown as { getMap?: () => unknown }).getMap?.() ?? map;
  const m = inner as {
    fitBounds?: (b: [[number, number], [number, number]], o: object) => void;
    flyTo?: (o: object) => void;
    easeTo?: (o: object) => void;
    getZoom?: () => number;
    getCenter?: () => { lng: number; lat: number };
    once?: (ev: string, fn: () => void) => void;
  };
  if (typeof m?.fitBounds !== "function") return null;
  return m as MapboxLike;
}

export function getNativeMap(
  mapRef: RefObject<MapRef | null>
): { flyTo: (o: object) => void; getZoom: () => number; easeTo: (o: object) => void } | null {
  const r = mapRef.current as unknown as { getMap?: () => { flyTo: (o: object) => void; getZoom: () => number; easeTo: (o: object) => void } } | null;
  const inner = r?.getMap?.() ?? (r as unknown as { flyTo?: (o: object) => void; getZoom?: () => number } | null);
  if (inner && typeof (inner as { flyTo?: unknown }).flyTo === "function")
    return inner as { flyTo: (o: object) => void; getZoom: () => number; easeTo: (o: object) => void };
  return null;
}

export function getMapboxMap(map: MapRef | null): { getLayer: (id: string) => unknown } | null {
  if (!map) return null;
  const inner =
    (map as unknown as { getMap?: () => { getLayer?: (id: string) => unknown } }).getMap?.() ?? map;
  if (typeof inner?.getLayer !== "function") return null;
  return inner as { getLayer: (id: string) => unknown };
}

export function filterExistingLayerIds(map: MapRef, layerIds: readonly string[]): string[] {
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

export function filterPropertyPointLayerIds(map: MapRef): string[] {
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
