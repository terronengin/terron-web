"use client";

import MapView from "../MapView";
import type { MapViewProps } from "./map.types";

export type MapViewV2Props = Pick<
  MapViewProps,
  "items" | "onPropertyClick" | "onSelectPropertyId" | "onOpenInfo" | "onOpenPropertyPanel"
>;

/**
 * Dashboard haritası — filtre/selected dashboard tarafında; `MapView` ile aynı harita motoru.
 * Marker üstündeki sayı: `MapBubbleLayer` → GeoJSON `feature.properties.count` ← `useMapHierarchy().countGeo`
 * ← `buildVisibleCountGeoFromHierarchy` ← `buildHierarchyIndex` (mahalle=ilan adedi, üstler=alt toplamlar).
 */
export default function MapViewV2(props: MapViewV2Props) {
  return <MapView {...props} />;
}
