"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, MapRef, NavigationControl, Source } from "react-map-gl/mapbox";
import {
  L_FOCUS_FILL,
  L_FOCUS_GLOW,
  L_FOCUS_OUT,
  L_SELECTED_GLOW,
  L_SELECTED_POINT,
  MAP_CENTER_LAT,
  MAP_CENTER_LNG,
  MAP_ZOOM,
  POLY_SOURCES,
  SRC_SELECTED,
} from "./map/map.config";
import {
  districtKeyFromParts,
  expandCenterToBounds,
  findMapItemByCoords,
  findMapItemByIdLikeInList,
  hierarchyBoundsToBBoxLike,
  hierarchyKeyFromString,
  isValidBounds as isValidHierarchyBounds,
  lookupCityKey,
  mapItemWithParsedCoords,
  nearestItemToLngLat,
  neighborhoodKeyFromParts,
  normTR,
  parsePropertyCoords,
  stableMapItemId,
} from "./map/map.data";
import { filterExistingLayerIds, isMapStyleReady, safeClearFeatureHover, safeSetFeatureHover } from "./map/map.mapbox";
import { MapBubbleLayer } from "./map/MapBubbleLayer";
import { MapOverlayPanel } from "./map/MapOverlayPanel";
import { MapPolygonLayer } from "./map/MapPolygonLayer";
import { fillPaintDefault, fillPaintRegionView, lineGlowPaint, lineOutPaint } from "./map/map.paint";
import type { HierarchyBounds, HierarchyIndex, MapItem, MapViewProps } from "./map/map.types";
import { useMapCamera } from "./map/useMapCamera";
import { useMapHierarchy } from "./map/useMapHierarchy";

export default function MapView(props: MapViewProps) {
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN as string | undefined;
  const mapRef = useRef<MapRef | null>(null);

  const hierarchy = useMapHierarchy({
    items: props.items,
    filters: props.filters,
    selected: props.selected,
  });

  const {
    mergedItems,
    hierarchyIndex,
    selectedRegionKey,
    selectedCityKey,
    selectedDistrictKey,
    level,
    setLevel,
    pickedRegion,
    setPickedRegion,
    pickedCity,
    setPickedCity,
    pickedDistrict,
    setPickedDistrict,
    pickedNeighborhood,
    setPickedNeighborhood,
    parcelItems,
    pointsMapItems,
    selectedGeo,
    activeProvinceGeo,
    activeDistrictGeo,
    parcelFocusGeo,
    activePoly,
    countGeo,
    provGeo,
    distGeo,
    panelTitle,
    panelBreadcrumb,
    panelSubtitle,
  } = hierarchy;

  const camera = useMapCamera(mapRef, { provGeo, distGeo });

  function resolveCityDisplayName(ix: HierarchyIndex, regionKey: string, nameRaw: string): string {
    const r = ix.regionsByKey[regionKey];
    if (!r) return nameRaw;
    const target = normTR(nameRaw);
    for (const ck of r.childKeys) {
      const c = ix.citiesByKey[ck];
      if (c && normTR(c.name) === target) return c.name;
    }
    return nameRaw;
  }

  function resolveDistrictDisplayName(ix: HierarchyIndex, cityKey: string, nameRaw: string): string {
    const c = ix.citiesByKey[cityKey];
    if (!c) return nameRaw;
    const target = normTR(nameRaw);
    for (const dk of c.childKeys) {
      const d = ix.districtsByKey[dk];
      if (d && normTR(d.name) === target) return d.name;
    }
    return nameRaw;
  }

  function resolveNeighborhoodDisplayName(ix: HierarchyIndex, districtKey: string, nameRaw: string): string {
    const d = ix.districtsByKey[districtKey];
    if (!d) return nameRaw;
    const target = normTR(nameRaw);
    for (const nk of d.childKeys) {
      const n = ix.neighborhoodsByKey[nk];
      if (n && normTR(n.name) === target) return n.name;
    }
    return nameRaw;
  }

  function focusFromHierarchyNode(
    fitLevel: "region" | "city" | "district" | "neighborhood",
    key: string,
    bounds: HierarchyBounds | null | undefined,
    center: [number, number] | null | undefined,
    label: string
  ): boolean {
    const padDeg = 0.02;
    let bbox: [[number, number], [number, number]] | null = null;
    if (bounds && isValidHierarchyBounds(bounds)) {
      bbox = hierarchyBoundsToBBoxLike(bounds);
      if (fitLevel === "district") console.log(`[camera] focusDistrict bounds:`, bbox, label);
      else if (fitLevel === "neighborhood") console.log(`[camera] focusNeighborhood bounds:`, bbox, label);
      else console.log(`[camera] ${label} bounds`, bbox);
    } else if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      bbox = hierarchyBoundsToBBoxLike(expandCenterToBounds(center, padDeg));
      if (fitLevel === "district") console.log(`[camera] focusDistrict center→bounds:`, bbox, label);
      else if (fitLevel === "neighborhood") console.log(`[camera] focusNeighborhood center→bounds:`, bbox, label);
      else console.log(`[camera] ${label} center→bounds`, bbox);
    }
    if (!bbox) {
      console.log(`[camera] skipped because no valid node/bounds: ${label}`);
      return false;
    }
    if (fitLevel === "region") return camera.focusRegion(bbox, key);
    if (fitLevel === "city") return camera.focusCity(bbox, key);
    if (fitLevel === "district") return camera.focusDistrict(bbox, key);
    return camera.focusNeighborhood(bbox, key);
  }

  function handleRegionClick(regionKey: string, opts?: { polygonGeom?: unknown }) {
    const r = hierarchyIndex.regionsByKey[regionKey];
    if (!r) {
      console.log(`[level] handleRegionClick skip: unknown key ${regionKey}`);
      return;
    }
    console.log(`[level] handleRegionClick`, regionKey);
    setPickedRegion(r.name);
    setPickedCity("");
    setPickedDistrict("");
    setPickedNeighborhood("");
    props.onSetCity?.("");
    props.onSetDistrict?.("");
    props.onSetNeighborhood?.("");
    setLevel("city");
    if (opts?.polygonGeom && camera.focusClickedPolygon(opts.polygonGeom, "city", `poly:region:${regionKey}`)) {
      return;
    }
    if (camera.focusRegionByProvinceName(r.name)) return;
    focusFromHierarchyNode("region", `region:${regionKey}`, r.bounds, r.center ?? null, "region");
  }

  function handleCityClick(cityKey: string, opts?: { polygonGeom?: unknown }) {
    const c = hierarchyIndex.citiesByKey[cityKey];
    if (!c) {
      console.log(`[level] handleCityClick skip: unknown key ${cityKey}`);
      return;
    }
    const region = hierarchyIndex.regionsByKey[c.parentKeys[0]];
    if (!region) return;
    console.log(`[level] handleCityClick`, cityKey);
    setPickedRegion(region.name);
    setPickedCity(c.name);
    setPickedDistrict("");
    setPickedNeighborhood("");
    props.onSetCity?.(c.name);
    props.onSetDistrict?.("");
    props.onSetNeighborhood?.("");
    setLevel("district");
    if (opts?.polygonGeom && camera.focusClickedPolygon(opts.polygonGeom, "city", `poly:city:${cityKey}`)) {
      return;
    }
    if (camera.focusCityByProvinceName(c.name)) return;
    focusFromHierarchyNode("city", `city:${cityKey}`, c.bounds, c.center ?? null, "city");
  }

  function handleDistrictClick(districtKey: string, opts?: { polygonGeom?: unknown }) {
    const d = hierarchyIndex.districtsByKey[districtKey];
    if (!d) {
      console.log(`[level] handleDistrictClick skip: unknown key ${districtKey}`);
      return;
    }
    const region = hierarchyIndex.regionsByKey[d.parentKeys[0]];
    const city = hierarchyIndex.citiesByKey[d.parentKeys[1]];
    if (!region || !city) return;
    console.log(`[level] handleDistrictClick`, districtKey);
    console.log(`[markers] neighborhood children count: ${d.childKeys.length}`);
    setPickedRegion(region.name);
    setPickedCity(city.name);
    setPickedDistrict(d.name);
    setPickedNeighborhood("");
    props.onSetCity?.(city.name);
    props.onSetDistrict?.(d.name);
    props.onSetNeighborhood?.("");
    setLevel("neighborhood");
    queueMicrotask(() => {
      if (opts?.polygonGeom && camera.focusClickedPolygon(opts.polygonGeom, "district", `poly:district:${districtKey}`)) {
        return;
      }
      const zoomed = focusFromHierarchyNode(
        "district",
        `district:${districtKey}`,
        d.bounds,
        d.center ?? null,
        "district"
      );
      if (!zoomed) {
        camera.focusDistrictFromGADM(city.name, d.name, opts?.polygonGeom);
      }
    });
  }

  function handleNeighborhoodClick(neighborhoodKey: string, opts?: { polygonGeom?: unknown }) {
    const n = hierarchyIndex.neighborhoodsByKey[neighborhoodKey];
    if (!n) {
      console.log(`[level] handleNeighborhoodClick skip: unknown key ${neighborhoodKey}`);
      return;
    }
    const region = hierarchyIndex.regionsByKey[n.parentKeys[0]];
    const city = hierarchyIndex.citiesByKey[n.parentKeys[1]];
    const district = hierarchyIndex.districtsByKey[n.parentKeys[2]];
    if (!region || !city || !district) return;
    console.log(`[level] handleNeighborhoodClick`, neighborhoodKey);
    console.log(`[markers] parcel children count: ${n.childKeys.length}`);
    setPickedRegion(region.name);
    setPickedCity(city.name);
    setPickedDistrict(district.name);
    setPickedNeighborhood(n.name);
    props.onSetCity?.(city.name);
    props.onSetDistrict?.(district.name);
    props.onSetNeighborhood?.(n.name);
    setLevel("parcel");
    if (opts?.polygonGeom && camera.focusClickedPolygon(opts.polygonGeom, "district", `poly:nh:${neighborhoodKey}`)) {
      return;
    }
    focusFromHierarchyNode(
      "neighborhood",
      `nh:${neighborhoodKey}`,
      n.bounds,
      n.center ?? null,
      "neighborhood"
    );
  }

  /** İlçe sınırları içinde tüm parseller (Tümü) — mahalle seçilmeden parcel seviyesi */
  function handleDistrictWideParcelClick(districtKey: string, opts?: { polygonGeom?: unknown }) {
    const d = hierarchyIndex.districtsByKey[districtKey];
    if (!d) {
      console.log(`[level] handleDistrictWideParcelClick skip: ${districtKey}`);
      return;
    }
    const region = hierarchyIndex.regionsByKey[d.parentKeys[0]];
    const city = hierarchyIndex.citiesByKey[d.parentKeys[1]];
    if (!region || !city) return;
    console.log(`[level] handleDistrictWideParcelClick`, districtKey);
    setPickedRegion(region.name);
    setPickedCity(city.name);
    setPickedDistrict(d.name);
    setPickedNeighborhood("");
    props.onSetCity?.(city.name);
    props.onSetDistrict?.(d.name);
    props.onSetNeighborhood?.("");
    setLevel("parcel");
    if (opts?.polygonGeom && camera.focusClickedPolygon(opts.polygonGeom, "district", `poly:district-wide:${districtKey}`)) {
      return;
    }
    focusFromHierarchyNode(
      "neighborhood",
      `district-all:${districtKey}`,
      d.bounds,
      d.center ?? null,
      "district-all"
    );
  }

  function resolveParcelKeyFromPropertyId(propertyId: string): string | null {
    const it =
      findMapItemByIdLikeInList(parcelItems, propertyId) ?? findMapItemByIdLikeInList(mergedItems, propertyId);
    if (!it) return null;
    return `parcel:${stableMapItemId(it)}`;
  }

  function handleParcelClick(parcelKeyOrPropertyId: string) {
    let pk = parcelKeyOrPropertyId.trim();
    if (!pk) return;
    if (!pk.startsWith("parcel:")) {
      const resolved = resolveParcelKeyFromPropertyId(pk);
      if (resolved) pk = resolved;
    }
    const node = hierarchyIndex.parcelsByKey[pk];
    const item = node?.items[0];
    if (item) {
      console.log(`[level] handleParcelClick`, pk);
      const gc = node.center;
      if (gc && Number.isFinite(gc[0]) && Number.isFinite(gc[1])) {
        emitPropertyFromMapItem(item, { center: gc, key: pk });
      } else {
        emitPropertyFromMapItem(item);
      }
      return;
    }
    const fallback =
      findMapItemByIdLikeInList(parcelItems, parcelKeyOrPropertyId) ??
      findMapItemByIdLikeInList(mergedItems, parcelKeyOrPropertyId);
    if (fallback) {
      console.log(`[level] handleParcelClick by id`, parcelKeyOrPropertyId);
      emitPropertyFromMapItem(fallback);
      return;
    }
    console.log(`[level] handleParcelClick skip: ${parcelKeyOrPropertyId}`);
  }

  const [hoverPolyId, setHoverPolyId] = useState<string | null>(null);
  const [selectedPolyId, setSelectedPolyId] = useState<string | null>(null);

  const propsItems = mergedItems;

  /** Polygon hover’ın hangi source’ta olduğu (level değişince eski source’a güvenli clear için) */
  const polyHoverSourceRef = useRef<string | null>(null);
  const hoverPolyIdRef = useRef<string | null>(null);

  useEffect(() => {
    hoverPolyIdRef.current = hoverPolyId;
  }, [hoverPolyId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapStyleReady(map)) return;
    const hid = hoverPolyIdRef.current;
    if (hid) {
      console.log(`[hover] reset on level change: ${level}`);
      safeClearFeatureHover(map, polyHoverSourceRef.current, hid);
    }
    polyHoverSourceRef.current = null;
    setHoverPolyId(null);
  }, [level]);

  const prevSelectedPolyIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSelectedPolyIdRef.current === selectedPolyId) return;
    prevSelectedPolyIdRef.current = selectedPolyId;
    const map = mapRef.current;
    if (!map || !isMapStyleReady(map)) return;
    const hid = hoverPolyIdRef.current;
    if (hid) {
      safeClearFeatureHover(map, polyHoverSourceRef.current, hid);
      polyHoverSourceRef.current = null;
      setHoverPolyId(null);
    }
  }, [selectedPolyId]);

  function clearPolyHover() {
    const map = mapRef.current;
    if (!map || !isMapStyleReady(map)) return;
    if (hoverPolyId) {
      safeClearFeatureHover(map, polyHoverSourceRef.current ?? activePoly?.src, hoverPolyId);
    }
    polyHoverSourceRef.current = null;
    setHoverPolyId(null);
  }

  function goBack() {
    clearPolyHover();
    setSelectedPolyId(null);

    if (level === "parcel") {
      setPickedNeighborhood("");
      props.onSetNeighborhood?.("");
      setLevel("neighborhood");

      const dk = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
      const distNode = hierarchyIndex.districtsByKey[dk];
      focusFromHierarchyNode(
        "district",
        `back:neighborhood:${normTR(pickedCity)}:${normTR(pickedDistrict)}`,
        distNode?.bounds,
        distNode?.center ?? null,
        "district"
      );
      return;
    }

    if (level === "neighborhood") {
      setPickedDistrict("");
      setPickedNeighborhood("");
      props.onSetDistrict?.("");
      props.onSetNeighborhood?.("");
      setLevel("district");

      if (!camera.focusCityByProvinceName(pickedCity)) {
        const ck = lookupCityKey(pickedRegion, pickedCity);
        const cityNode = hierarchyIndex.citiesByKey[ck];
        focusFromHierarchyNode(
          "city",
          `back:district:${normTR(pickedCity)}`,
          cityNode?.bounds,
          cityNode?.center ?? null,
          "city"
        );
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

      const rk = hierarchyKeyFromString(pickedRegion);
      const regionNode = hierarchyIndex.regionsByKey[rk];
      focusFromHierarchyNode(
        "region",
        `back:city:${normTR(pickedRegion)}`,
        regionNode?.bounds,
        regionNode?.center ?? null,
        "region"
      );
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
      camera.focusTurkey();
    }
  }

  function handleCountNavigation(f: { properties?: Record<string, unknown> }, _clickedFeature?: unknown) {
    const p = f.properties ?? {};

    if (level === "parcel") {
      const pid = String(p.id ?? "").trim();
      if (pid) handleParcelClick(pid);
      return;
    }

    const nameRaw = String(p.name || "").trim();
    if (!nameRaw) return;

    if (level === "region") {
      handleRegionClick(hierarchyKeyFromString(nameRaw));
      return;
    }

    if (level === "city") {
      const rpk = hierarchyKeyFromString(pickedRegion);
      const realCity = resolveCityDisplayName(hierarchyIndex, rpk, nameRaw);
      handleCityClick(lookupCityKey(pickedRegion, realCity));
      return;
    }

    if (level === "district") {
      const realDistrict = resolveDistrictDisplayName(hierarchyIndex, selectedCityKey, nameRaw);
      const dk = districtKeyFromParts(pickedRegion, pickedCity, realDistrict);
      const geom = (_clickedFeature as { geometry?: unknown } | undefined)?.geometry;
      handleDistrictClick(dk, geom ? { polygonGeom: geom } : undefined);
      return;
    }

    if (level === "neighborhood") {
      if (String(p.neighborhood) === "__ALL__" || nameRaw === "Tümü") {
        const dkAll = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
        handleDistrictWideParcelClick(dkAll);
        return;
      }
      const dkN = selectedDistrictKey || districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
      const realNeighborhood = resolveNeighborhoodDisplayName(hierarchyIndex, dkN, nameRaw);
      handleNeighborhoodClick(neighborhoodKeyFromParts(pickedRegion, pickedCity, pickedDistrict, realNeighborhood));
    }
  }

  function emitPropertyFromMapItem(
    item: MapItem,
    focus?: { center: [number, number]; key: string }
  ) {
    if (focus?.center && Number.isFinite(focus.center[0]) && Number.isFinite(focus.center[1])) {
      camera.focusParcel(focus.center, focus.key);
    } else {
      const c = parsePropertyCoords(item);
      if (c) {
        camera.focusParcel([c.lng, c.lat], `parcel:emit:${item.id}`);
      }
    }
    props.onOpenPropertyPanel?.();
    if (props.onPropertyClick) {
      props.onPropertyClick(item);
      return;
    }
    props.onSelectPropertyId?.(String(item.id).trim());
    props.onOpenInfo?.();
  }

  function onMapClick(e: { features?: unknown[]; point?: unknown; lngLat?: { lng?: number; lat?: number } }) {
    const map = mapRef.current;
    if (!map || !isMapStyleReady(map)) return;

    const topFeature = e.features?.[0] as { geometry?: unknown } | undefined;

    if (activePoly) {
      const polyLayerIds = filterExistingLayerIds(map, [activePoly.fill, activePoly.out, activePoly.glow]);
      const hits =
        polyLayerIds.length > 0
          ? map.queryRenderedFeatures(e.point as never, {
              layers: polyLayerIds,
            })
          : [];
      if (hits && hits.length > 0) {
        const f = hits[0] as {
          geometry?: unknown;
          properties?: Record<string, unknown>;
          id?: unknown;
        };
        const featForZoom: typeof f | undefined = (topFeature as typeof f | undefined) ?? f;
        const geom = f.geometry;
        const p = f.properties || {};
        const id = String(p.id || f.id || "");
        if (id) setSelectedPolyId(id);

        if (level === "region") {
          const regionName = String(p.region || "").trim();
          const provinceName = String(p.name || p.NAME_1 || "").trim();
          if (regionName) {
            handleRegionClick(hierarchyKeyFromString(regionName), geom && provinceName ? { polygonGeom: geom } : undefined);
          }
          return;
        }

        if (level === "city") {
          const cityNameRaw = String(p.name || p.NAME_1 || "").trim();
          if (!cityNameRaw) return;
          const rpk = hierarchyKeyFromString(pickedRegion);
          const realCity = resolveCityDisplayName(hierarchyIndex, rpk, cityNameRaw);
          const ck = lookupCityKey(pickedRegion, realCity);
          handleCityClick(ck, geom ? { polygonGeom: geom } : undefined);
          return;
        }

        if (level === "district") {
          const districtNameRaw = String(p.name || p.NAME_2 || p.district || "").trim();
          if (!districtNameRaw) return;
          const realDistrict = resolveDistrictDisplayName(hierarchyIndex, selectedCityKey, districtNameRaw);
          const dk = districtKeyFromParts(pickedRegion, pickedCity, realDistrict);
          handleDistrictClick(dk, geom ? { polygonGeom: geom } : undefined);
          return;
        }

        if (level === "neighborhood") {
          const dkN = districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict);
          const distNode = hierarchyIndex.districtsByKey[dkN];
          if (distNode && distNode.count > 0) {
            const g = featForZoom?.geometry;
            handleDistrictWideParcelClick(dkN, g ? { polygonGeom: g } : undefined);
          }
          return;
        }
      }
    }

    if (level === "parcel") {
      const lng = Number(e.lngLat?.lng);
      const lat = Number(e.lngLat?.lat);

      const focusLayerIds = filterExistingLayerIds(map, [L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT]);
      const focusHits =
        focusLayerIds.length > 0
          ? map.queryRenderedFeatures(e.point as never, {
              layers: focusLayerIds,
            })
          : [];
      if (focusHits && focusHits.length > 0) {
        const nearest = nearestItemToLngLat(parcelItems, lng, lat);
        if (nearest) {
          handleParcelClick(`parcel:${stableMapItemId(nearest)}`);
          return;
        }
      }

      const nearest = nearestItemToLngLat(parcelItems, lng, lat);
      if (nearest) {
        handleParcelClick(`parcel:${stableMapItemId(nearest)}`);
      }
    }
  }

  function onMouseMove(e: {
    point?: unknown;
    lngLat?: { lng?: number; lat?: number };
  }) {
    const map = mapRef.current;
    if (!map || !isMapStyleReady(map)) return;

    if (props.selected && selectedGeo.features.length > 0) {
      const selIds = filterExistingLayerIds(map, [L_SELECTED_GLOW, L_SELECTED_POINT]);
      if (selIds.length > 0) {
        const shits = map.queryRenderedFeatures(e.point as never, { layers: selIds });
        if (shits && shits.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          clearPolyHover();
          return;
        }
      }
    }

    if (activePoly) {
      const polyLayerIds = filterExistingLayerIds(map, [activePoly.fill, activePoly.out, activePoly.glow]);
      if (polyLayerIds.length > 0) {
        const hits = map.queryRenderedFeatures(e.point as never, {
          layers: polyLayerIds,
        });
        if (hits && hits.length > 0) {
          map.getCanvas().style.cursor = "pointer";
          const f = hits[0] as { properties?: { id?: string }; id?: unknown };
          const pid = String(f.properties?.id || f.id || "");

          if (pid && pid !== hoverPolyId) {
            if (hoverPolyId) {
              safeClearFeatureHover(map, polyHoverSourceRef.current, hoverPolyId);
            }
            polyHoverSourceRef.current = activePoly.src;
            safeSetFeatureHover(map, activePoly.src, pid, true);
            setHoverPolyId(pid);
          }

          return;
        } else if (hoverPolyId) {
          safeClearFeatureHover(map, polyHoverSourceRef.current, hoverPolyId);
          polyHoverSourceRef.current = null;
          setHoverPolyId(null);
        }
      } else if (hoverPolyId) {
        safeClearFeatureHover(map, polyHoverSourceRef.current, hoverPolyId);
        polyHoverSourceRef.current = null;
        setHoverPolyId(null);
      }
    }

    if (level === "parcel") {
      const focusLayerIds = filterExistingLayerIds(map, [L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT]);
      if (focusLayerIds.length > 0) {
        const fhits = map.queryRenderedFeatures(e.point as never, { layers: focusLayerIds });
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
  }

  const interactiveLayers = useMemo(() => {
    const arr: string[] = [];
    if (activePoly) arr.push(activePoly.fill, activePoly.glow, activePoly.out);
    if (props.selected && selectedGeo.features.length > 0) {
      arr.push(L_SELECTED_GLOW, L_SELECTED_POINT);
    }
    if (level === "parcel") {
      arr.push(L_FOCUS_FILL, L_FOCUS_GLOW, L_FOCUS_OUT);
    }
    return arr;
  }, [activePoly, level, pointsMapItems.length, props.selected?.id, selectedGeo.features.length]);

  const fillRegion = useMemo(() => fillPaintRegionView(selectedPolyId), [selectedPolyId]);
  const fillDefault = useMemo(() => fillPaintDefault(selectedPolyId), [selectedPolyId]);
  const lineGlow = useMemo(() => lineGlowPaint(selectedPolyId), [selectedPolyId]);
  const lineOut = useMemo(() => lineOutPaint(selectedPolyId), [selectedPolyId]);

  if (!MAPBOX_TOKEN) {
    return (
      <div style={{ padding: 16, color: "white" }}>
        MAPBOX TOKEN yok: <code>NEXT_PUBLIC_MAPBOX_TOKEN</code>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapOverlayPanel
        title={panelTitle}
        breadcrumb={panelBreadcrumb}
        subtitle={panelSubtitle}
        showBack={level !== "region"}
        onBack={goBack}
      />

      <MapGL
        ref={(r) => {
          mapRef.current = r;
        }}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        initialViewState={{ longitude: MAP_CENTER_LNG, latitude: MAP_CENTER_LAT, zoom: MAP_ZOOM }}
        minZoom={3}
        maxZoom={17}
        onLoad={() => {}}
        onClick={onMapClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        interactiveLayerIds={interactiveLayers}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" />

        {level === "region" && (
          <MapPolygonLayer
            mode="prov-region"
            sourceId={POLY_SOURCES.region}
            data={provGeo}
            fillPaint={fillRegion}
            lineGlowPaint={lineGlow}
            lineOutPaint={lineOut}
            promoteId="id"
          />
        )}
        {level === "city" && (
          <MapPolygonLayer
            mode="prov-city"
            sourceId={POLY_SOURCES.city}
            data={activeProvinceGeo}
            fillPaint={fillDefault}
            lineGlowPaint={lineGlow}
            lineOutPaint={lineOut}
            promoteId="id"
          />
        )}

        {(level === "district" || level === "neighborhood") && (
          <MapPolygonLayer
            mode="dist"
            sourceId={level === "district" ? POLY_SOURCES.district : POLY_SOURCES.neighborhood}
            data={activeDistrictGeo}
            fillPaint={fillDefault}
            lineGlowPaint={lineGlow}
            lineOutPaint={lineOut}
            promoteId="id"
          />
        )}

        {level === "parcel" && (
          <MapPolygonLayer mode="parcel-focus" sourceId={POLY_SOURCES.parcelFocus} data={parcelFocusGeo} />
        )}

        <MapBubbleLayer
          data={countGeo}
          level={level}
          onMarkerClick={({ properties }) =>
            handleCountNavigation({ properties: properties as Record<string, unknown> }, undefined)
          }
        />

        {selectedGeo.features.length > 0 && (
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
