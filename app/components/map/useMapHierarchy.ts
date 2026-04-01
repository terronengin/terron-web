"use client";

import type { Feature, FeatureCollection, Point } from "geojson";
import { useEffect, useMemo, useState } from "react";
import {
  L_DIST_FILL,
  L_DIST_GLOW,
  L_DIST_OUT,
  L_PROV_FILL,
  L_PROV_GLOW,
  L_PROV_OUT,
  POLY_SOURCES,
  TURKEY_REGIONS,
} from "./map.config";
import {
  buildActiveDistrictGeo,
  buildActiveProvinceGeo,
  buildHierarchyIndex,
  buildParcelFocusGeo,
  buildSelectedGeo,
  buildValidatedItems,
  buildVisibleCountGeoFromHierarchy,
  districtKeyFromParts,
  getParcelItemsFromHierarchy,
  getParcelViewParentBoundsSource,
  getRegionName,
  neighborhoodKeyFromParts,
  hierarchyKeyFromString,
  isTurkeyRegionName,
  lookupCityKey,
} from "./map.data";
import type { ActivePolyConfig, CountPointProps, MapItem, MapLevel, MapViewProps } from "./map.types";

function safeStr(x: unknown): string {
  return typeof x === "string" ? x : "";
}

export function useMapHierarchy(props: Pick<MapViewProps, "items" | "filters" | "selected">) {
  const [level, setLevel] = useState<MapLevel>("region");
  const [pickedRegion, setPickedRegion] = useState("");
  const [pickedCity, setPickedCity] = useState("");
  const [pickedDistrict, setPickedDistrict] = useState("");
  const [pickedNeighborhood, setPickedNeighborhood] = useState("");

  const [provGeo, setProvGeo] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });
  const [distGeo, setDistGeo] = useState<FeatureCollection>({ type: "FeatureCollection", features: [] });

  useEffect(() => {
    let alive = true;

    async function loadProvince() {
      try {
        const r = await fetch("/geo/gadm41_TUR_1.json", { cache: "force-cache" });
        if (!r.ok) throw new Error("gadm41_TUR_1.json");
        const gj = await r.json();
        const features = ((gj.features || []) as Record<string, unknown>[]).map((f, i) => {
          const name = safeStr((f?.properties as Record<string, unknown> | undefined)?.NAME_1);
          const id = safeStr((f?.properties as Record<string, unknown> | undefined)?.GID_1) || `prov_${i}`;
          const region = getRegionName(name);
          return {
            ...f,
            id,
            properties: {
              ...((f.properties as object) || {}),
              id,
              name,
              city: name,
              region,
            },
          };
        });
        if (!alive) return;
        setProvGeo({ type: "FeatureCollection", features: features as unknown as Feature[] });
      } catch (e) {
        console.warn("[map] provinces load failed:", e);
      }
    }

    async function loadDistrict() {
      try {
        const r = await fetch("/geo/gadm41_TUR_2.json", { cache: "force-cache" });
        if (!r.ok) {
          if (!alive) return;
          setDistGeo({ type: "FeatureCollection", features: [] });
          return;
        }
        const gj = await r.json();
        const features = ((gj.features || []) as Record<string, unknown>[]).map((f, i) => {
          const city = safeStr((f?.properties as Record<string, unknown> | undefined)?.NAME_1);
          const district = safeStr((f?.properties as Record<string, unknown> | undefined)?.NAME_2);
          const id = safeStr((f?.properties as Record<string, unknown> | undefined)?.GID_2) || `dist_${i}`;
          return {
            ...f,
            id,
            properties: {
              ...((f.properties as object) || {}),
              id,
              city,
              district,
            },
          };
        });
        if (!alive) return;
        setDistGeo({ type: "FeatureCollection", features: features as unknown as Feature[] });
      } catch (e) {
        console.warn("[map] districts load failed:", e);
      }
    }

    void loadProvince();
    void loadDistrict();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const f = props.filters;
    if (!f) return;
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
      setPickedRegion((prev) => ((TURKEY_REGIONS as readonly string[]).includes(prev) ? "" : prev));
    }
  }, [props.filters]);

  const { list: mergedItems, stats: pipelineStats } = useMemo(
    () => buildValidatedItems(props.items || []),
    [props.items]
  );

  const hierarchyIndex = useMemo(() => {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const ix = buildHierarchyIndex(mergedItems, { distGeo });
    const ms = (typeof performance !== "undefined" ? performance.now() : 0) - t0;
    console.log(`[hierarchy] build time ${ms.toFixed(1)}ms`);
    return ix;
  }, [mergedItems, distGeo]);

  const selectedRegionKey = pickedRegion.trim() ? hierarchyKeyFromString(pickedRegion) : "";
  const selectedCityKey = pickedCity.trim() ? lookupCityKey(pickedRegion, pickedCity) : "";
  const selectedDistrictKey =
    pickedCity.trim() && pickedDistrict.trim()
      ? districtKeyFromParts(pickedRegion, pickedCity, pickedDistrict)
      : "";

  const activeProvinceGeo = useMemo(
    () => buildActiveProvinceGeo(provGeo, pickedRegion),
    [provGeo, pickedRegion]
  );

  const activeDistrictGeo = useMemo(
    () => buildActiveDistrictGeo(distGeo, pickedCity, pickedDistrict, level),
    [distGeo, pickedCity, pickedDistrict, level]
  );

  const parcelFocusGeo = useMemo(
    () => buildParcelFocusGeo(level, activeDistrictGeo, pickedDistrict),
    [level, activeDistrictGeo, pickedDistrict]
  );

  const countGeo = useMemo<FeatureCollection<Point, CountPointProps>>(
    () =>
      buildVisibleCountGeoFromHierarchy({
        level,
        ix: hierarchyIndex,
        selectedRegionKey,
        selectedCityKey,
        selectedDistrictKey,
        pickedRegion,
        pickedCity,
        pickedDistrict,
        pickedNeighborhood,
        mergedItems,
        distGeo,
      }),
    [
      level,
      hierarchyIndex,
      selectedRegionKey,
      selectedCityKey,
      selectedDistrictKey,
      pickedRegion,
      pickedCity,
      pickedDistrict,
      pickedNeighborhood,
      mergedItems,
      distGeo,
    ]
  );

  const parcelItems = useMemo(() => {
    if (level !== "parcel") return [];
    return getParcelItemsFromHierarchy(
      hierarchyIndex,
      pickedCity,
      pickedDistrict,
      pickedNeighborhood,
      pickedRegion
    );
  }, [level, hierarchyIndex, pickedCity, pickedDistrict, pickedNeighborhood, pickedRegion]);

  useEffect(() => {
    if (level !== "parcel" || !pickedNeighborhood.trim()) return;
    const nk = neighborhoodKeyFromParts(pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood);
    const n = hierarchyIndex.neighborhoodsByKey[nk];
    const childCount = n ? n.childKeys.length : 0;
    const boundsSource = getParcelViewParentBoundsSource(
      hierarchyIndex,
      pickedRegion,
      pickedCity,
      pickedDistrict,
      pickedNeighborhood
    );
    console.log(`[parcel-view] selectedNeighborhoodKey ${nk}`);
    console.log(
      `[parcel-view] visible parcel count ${parcelItems.length} (neighborhood childKeys=${childCount})`
    );
    console.log(`[parcel-view] parent node bounds source: ${boundsSource}`);
  }, [
    level,
    pickedNeighborhood,
    pickedRegion,
    pickedCity,
    pickedDistrict,
    hierarchyIndex,
    parcelItems,
  ]);

  const pointsMapItems = parcelItems;

  const selectedGeo = useMemo(() => buildSelectedGeo(props.selected), [props.selected]);

  const activePoly = useMemo<ActivePolyConfig>(() => {
    if (level === "region") {
      return { src: POLY_SOURCES.region, fill: L_PROV_FILL, glow: L_PROV_GLOW, out: L_PROV_OUT };
    }
    if (level === "city") {
      return { src: POLY_SOURCES.city, fill: L_PROV_FILL, glow: L_PROV_GLOW, out: L_PROV_OUT };
    }
    if (level === "district") {
      return { src: POLY_SOURCES.district, fill: L_DIST_FILL, glow: L_DIST_GLOW, out: L_DIST_OUT };
    }
    if (level === "neighborhood") {
      return { src: POLY_SOURCES.neighborhood, fill: L_DIST_FILL, glow: L_DIST_GLOW, out: L_DIST_OUT };
    }
    return null;
  }, [level]);

  /** Bu seviyede haritada görünen baloncuk (cluster) sayısı; parselde parsel adedi */
  const visibleBubbleCount = useMemo(() => countGeo.features?.length ?? 0, [countGeo]);

  /** Özet panel için tek sayı (parcel: parsel; region: toplam ilan; diğer: görünür baloncuk) */
  const visibleListingCount = useMemo(() => {
    if (level === "parcel") return parcelItems.length;
    if (level === "region") return mergedItems.length;
    return visibleBubbleCount;
  }, [level, parcelItems.length, mergedItems.length, visibleBubbleCount]);

  const panelTitle = useMemo(() => {
    if (level === "region") return "Bölgeler";
    if (level === "city") return "İller";
    if (level === "district") return "İlçeler";
    if (level === "neighborhood") return "Mahalleler";
    return "Parseller";
  }, [level]);

  const panelBreadcrumb = useMemo(() => {
    const parts: string[] = [];
    if (pickedRegion.trim()) parts.push(pickedRegion.trim());
    if (pickedCity.trim()) parts.push(pickedCity.trim());
    if (pickedDistrict.trim()) parts.push(pickedDistrict.trim());
    if (pickedNeighborhood.trim()) parts.push(pickedNeighborhood.trim());
    if (parts.length === 0) return "Türkiye";
    return parts.join(" › ");
  }, [pickedRegion, pickedCity, pickedDistrict, pickedNeighborhood]);

  const panelSubtitle = useMemo(() => {
    if (level === "region") {
      return `${visibleBubbleCount} bölge • toplam ${mergedItems.length} ilan`;
    }
    if (level === "city") {
      return `${visibleBubbleCount} il • il görünümü`;
    }
    if (level === "district") {
      return `${visibleBubbleCount} ilçe • ilçe görünümü`;
    }
    if (level === "neighborhood") {
      return `${visibleBubbleCount} mahalle • mahalle görünümü`;
    }
    return `${parcelItems.length} ilan • parsel görünümü`;
  }, [level, visibleBubbleCount, mergedItems.length, parcelItems.length]);

  return {
    mergedItems,
    pipelineStats,
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
    visibleListingCount,
  };
}
