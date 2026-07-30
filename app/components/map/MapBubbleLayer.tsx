"use client";

import type { Feature, FeatureCollection, Point } from "geojson";
import { useEffect, useId, useMemo, useState } from "react";
import { Marker, useMap } from "react-map-gl/mapbox";
import type { CountPointProps, MapLevel } from "./map.types";

type DeclutterPoint = { key: string; x: number; y: number; count: number };

/**
 * Coğrafi olarak yakın baloncuklar (örn. birbirine yakın iller) ekranda üst üste
 * binmesin diye piksel uzayında hafif itme uygular. Gerçek lng/lat değişmez —
 * sadece görsel (CSS transform) offset üretir, önemli (sayısı büyük) baloncuk yerinde kalır.
 */
function computeDeclutterOffsets(
  points: DeclutterPoint[],
  minDist: number
): Map<string, { dx: number; dy: number }> {
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (points.length < 2 || minDist <= 0) return offsets;

  const placed: { x: number; y: number }[] = [];
  const sorted = [...points].sort((a, b) => b.count - a.count);

  for (const p of sorted) {
    let x = p.x;
    let y = p.y;
    for (let iter = 0; iter < 6; iter++) {
      let moved = false;
      for (const q of placed) {
        const dx = x - q.x;
        const dy = y - q.y;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          moved = true;
          const angle = dist > 0.001 ? Math.atan2(dy, dx) : (p.x + p.y) % (Math.PI * 2);
          const push = minDist - dist + 1;
          x += Math.cos(angle) * push;
          y += Math.sin(angle) * push;
        }
      }
      if (!moved) break;
    }
    placed.push({ x, y });
    if (x !== p.x || y !== p.y) {
      offsets.set(p.key, { dx: x - p.x, dy: y - p.y });
    }
  }
  return offsets;
}

function markerKeyFor(f: Feature<Point, CountPointProps>): string {
  return String(f.properties?.id ?? f.id ?? f.geometry.coordinates.join(","));
}

/** Sadece bölge/il/ilçe/mahalle baloncukları için (parsel zaten gerçek şekiller kullanıyor). */
function useDeclutterOffsets(
  features: Feature<Point, CountPointProps>[],
  level: MapLevel,
  zoom: number
): Map<string, { dx: number; dy: number }> {
  const maps = useMap();
  const mapInstance = maps.current;

  return useMemo(() => {
    if (level === "parcel" || !mapInstance || features.length < 2) return new Map();
    try {
      const map = mapInstance.getMap();
      const size = orbPixelSize(level, zoom);
      const minDist = size * 1.05;
      const points: DeclutterPoint[] = features.map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        const p = map.project([lng, lat]);
        return { key: markerKeyFor(f), x: p.x, y: p.y, count: Number(f.properties?.count ?? 0) };
      });
      return computeDeclutterOffsets(points, minDist);
    } catch {
      return new Map();
    }
  }, [features, level, zoom, mapInstance]);
}

export type MapBubbleLayerProps = {
  data: FeatureCollection<Point, CountPointProps>;
  level: MapLevel;
  onMarkerClick?: (payload: {
    properties: CountPointProps;
    longitude: number;
    latitude: number;
  }) => void;
};

const INNER_BG =
  "radial-gradient(circle at 35% 30%, rgba(255,240,180,0.16), rgba(12,14,20,0.88) 42%, rgba(8,10,16,0.94) 100%)";

const SHADOW_REST = [
  "0 0 0 1px rgba(255,215,0,0.22)",
  "0 0 10px rgba(255,215,0,0.28)",
  "0 0 24px rgba(255,215,0,0.14)",
].join(", ");

const SHADOW_HOVER = [
  "0 0 0 1px rgba(255,235,140,0.55)",
  "0 0 14px rgba(255,215,0,0.45)",
  "0 0 28px rgba(255,215,0,0.32)",
  "0 0 42px rgba(255,200,90,0.2)",
].join(", ");

const BORDER_REST = "2px solid rgba(255,215,0,0.95)";
const BORDER_HOVER = "2px solid rgba(255,248,210,1)";

/** Parsel damlacık — yalnızca ParcelDropletMarker */
const PARCEL_SHADOW_REST = [
  "0 0 0 1px rgba(255,215,0,0.22)",
  "0 0 8px rgba(255,215,0,0.24)",
  "0 0 16px rgba(255,215,0,0.10)",
].join(", ");

const PARCEL_SHADOW_HOVER = [
  "0 0 0 1px rgba(255,235,160,0.42)",
  "0 0 12px rgba(255,215,0,0.32)",
  "0 0 22px rgba(255,215,0,0.14)",
  "0 0 32px rgba(255,200,90,0.09)",
].join(", ");

/** Premium mini map pin (24×24 viewBox); ölçek 20–24px ile kalın stroke net görünür. */
const PIN_DROPLET_PATH =
  "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z";

function baseOrbPx(level: MapLevel): number {
  switch (level) {
    case "region":
      return 44;
    case "city":
      return 34;
    case "district":
      return 26;
    case "neighborhood":
      return 20;
    case "parcel":
      return 8;
    default:
      return 26;
  }
}

/** Düşük zoom’da hafif büyük, yüksek zoom’da hafif küçük — sınırlı aralık */
function zoomScale(zoom: number): number {
  if (zoom < 5) return 1.06;
  if (zoom < 7) return 1.03;
  if (zoom < 9) return 1;
  if (zoom < 11) return 0.97;
  return 0.94;
}

function orbPixelSize(level: MapLevel, zoom: number): number {
  const raw = baseOrbPx(level) * zoomScale(zoom);
  if (level === "parcel") {
    return Math.round(Math.min(10, Math.max(6, raw)));
  }
  return Math.round(raw);
}

/** Parsel damlacık yüksekliği ~20–24px (yalnızca ParcelDropletMarker) */
function parcelDropletHeightPx(zoom: number): number {
  const raw = 22 * zoomScale(zoom);
  return Math.round(Math.min(24, Math.max(20, raw)));
}

function countFontSizePx(orbPx: number, level: MapLevel): number {
  if (level === "parcel") return 0;
  const t = Math.round(orbPx * 0.28);
  return Math.min(16, Math.max(9, t));
}

function useMapZoom(): number {
  const maps = useMap();
  const mapRef = maps.current;
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    if (!mapRef) return;
    const m = mapRef.getMap();
    const tick = () => setZoom(mapRef.getZoom());
    tick();
    m.on("zoom", tick);
    m.on("moveend", tick);
    return () => {
      m.off("zoom", tick);
      m.off("moveend", tick);
    };
  }, [mapRef]);

  return zoom;
}

type OrbMarkerProps = {
  feature: Feature<Point, CountPointProps>;
  level: MapLevel;
  zoom: number;
  onMarkerClick?: MapBubbleLayerProps["onMarkerClick"];
  offsetX?: number;
  offsetY?: number;
};

function ParcelDropletMarker({
  feature,
  zoom,
  onMarkerClick,
}: {
  feature: Feature<Point, CountPointProps>;
  zoom: number;
  onMarkerClick?: MapBubbleLayerProps["onMarkerClick"];
}) {
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties;
  const count = Number(props?.count ?? 0);
  const [hover, setHover] = useState(false);
  const gradId = `parcel-pin-${useId().replace(/:/g, "")}`;

  const h = parcelDropletHeightPx(zoom);
  const w = Math.round(h * 0.72);

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        boxShadow: "none",
        outline: "none",
      }}
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onMarkerClick?.({ properties: props, longitude: lng, latitude: lat });
      }}
    >
      <div
        role="presentation"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          transform: hover ? "scale(1.08)" : "scale(1)",
          transformOrigin: "center bottom",
          display: "block",
          width: w,
          height: h,
          background: "transparent",
          boxShadow: hover ? PARCEL_SHADOW_HOVER : PARCEL_SHADOW_REST,
          borderRadius: 0,
          cursor: "pointer",
          transition: "transform 0.2s ease, box-shadow 0.22s ease",
          willChange: "transform",
        }}
        title={count > 0 ? String(count) : undefined}
      >
        <svg
          width={w}
          height={h}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: "block", verticalAlign: "top", overflow: "visible" }}
          aria-hidden
        >
          <defs>
            <radialGradient id={gradId} cx="36%" cy="38%" r="72%">
              <stop offset="0%" stopColor="rgba(255,218,120,0.14)" />
              <stop offset="45%" stopColor="rgba(10,14,22,0.97)" />
              <stop offset="100%" stopColor="rgba(8,12,18,0.96)" />
            </radialGradient>
          </defs>
          <path
            d={PIN_DROPLET_PATH}
            fill={`url(#${gradId})`}
            stroke="rgba(255,215,0,0.95)"
            strokeWidth={1.65}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <ellipse cx="12" cy="9.5" rx="3.4" ry="2.6" fill="rgba(255,215,0,0.07)" />
          <circle cx="12" cy="9.4" r="1.15" fill="rgba(255,215,0,0.18)" />
        </svg>
      </div>
    </Marker>
  );
}

function OrbMarker({ feature, level, zoom, onMarkerClick, offsetX = 0, offsetY = 0 }: OrbMarkerProps) {
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties;
  const count = Number(props?.count ?? 0);
  const regionLabel = level === "region" ? String(props?.name ?? "").trim() : "";

  const size = orbPixelSize(level, zoom);
  const [hover, setHover] = useState(false);

  const isParcelDot = level === "parcel";

  const fontSize = countFontSizePx(size, level);
  const nameFont = Math.min(10, Math.max(7, Math.round(size * 0.2)));

  if (isParcelDot) {
    return <ParcelDropletMarker feature={feature} zoom={zoom} onMarkerClick={onMarkerClick} />;
  }

  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="center"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        boxShadow: "none",
        outline: "none",
      }}
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onMarkerClick?.({ properties: props, longitude: lng, latitude: lat });
      }}
    >
      <div
        style={{
          transform: `translate(${offsetX}px, ${offsetY}px)`,
          transition: "transform 0.25s ease",
        }}
      >
      <div
        role="presentation"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          transform: `translate(-50%, -50%) scale(${hover ? 1.08 : 1})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "max-content",
          maxWidth: Math.max(size + 48, 120),
          background: "transparent",
          boxShadow: "none",
          cursor: "pointer",
          transition: "transform 0.22s ease",
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            boxSizing: "border-box",
            border: hover ? BORDER_HOVER : BORDER_REST,
            background: INNER_BG,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: hover ? SHADOW_HOVER : SHADOW_REST,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            transition: "border 0.22s ease, box-shadow 0.22s ease",
          }}
        >
          <span
            style={{
              color: "#FFF1B8",
              fontWeight: 700,
              letterSpacing: "0.01em",
              fontSize,
              lineHeight: 1,
              fontFamily: 'system-ui, "Segoe UI", sans-serif',
              textShadow: "0 0 8px rgba(255,215,0,0.18)",
              pointerEvents: "none",
              maxWidth: "88%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {count}
          </span>
        </div>

        {level === "region" && regionLabel ? (
          <div
            style={{
              marginTop: 4,
              maxWidth: Math.min(140, size * 2.4),
              padding: 0,
              background: "transparent",
              color: "rgba(255,241,184,0.82)",
              fontSize: nameFont,
              fontWeight: 600,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              textShadow: "0 0 6px rgba(255,215,0,0.12)",
            }}
          >
            {regionLabel}
          </div>
        ) : null}
      </div>
      </div>
    </Marker>
  );
}

/**
 * Bölge–mahalle: neon orb; parsel: mini SVG damlacık (altın stroke, koyu dolgu).
 */
export function MapBubbleLayer({ data, level, onMarkerClick }: MapBubbleLayerProps) {
  const z = useMapZoom();
  const features = (data.features ?? []) as Feature<Point, CountPointProps>[];
  const declutterOffsets = useDeclutterOffsets(features, level, z);

  /** Baloncuk üstündeki sayı: GeoJSON `properties.count` (kaynak: `buildHierarchyIndex` + `buildVisibleCountGeoFromHierarchy`). */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const list = data.features ?? [];
    if (list.length === 0) return;
    const nums = list.map((f) => Number((f as Feature<Point, CountPointProps>).properties?.count ?? 0));
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const unique = new Set(nums).size;
    console.log("[COUNT TRACE UI] summary", { level, markers: list.length, uniqueCountValues: unique, min, max });
    for (let i = 0; i < Math.min(12, list.length); i++) {
      const f = list[i] as Feature<Point, CountPointProps>;
      const p = f.properties;
      console.log("[COUNT TRACE UI]", {
        level,
        name: p?.name,
        count: p?.count,
        id: p?.id,
        district: p?.district,
        city: p?.city,
      });
    }
  }, [data, level]);

  return (
    <>
      {features.map((feat) => {
        const key = markerKeyFor(feat);
        const offset = declutterOffsets.get(key);
        return (
          <OrbMarker
            key={key}
            feature={feat}
            level={level}
            zoom={z}
            onMarkerClick={onMarkerClick}
            offsetX={offset?.dx}
            offsetY={offset?.dy}
          />
        );
      })}
    </>
  );
}
