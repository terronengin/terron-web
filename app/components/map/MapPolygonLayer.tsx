"use client";

import type { FeatureCollection } from "geojson";
import { Layer, Source } from "react-map-gl/mapbox";
import {
  L_DIST_FILL,
  L_DIST_GLOW,
  L_DIST_OUT,
  L_FOCUS_FILL,
  L_FOCUS_GLOW,
  L_FOCUS_OUT,
  L_PARCEL_SHAPE_FILL,
  L_PARCEL_SHAPE_GLOW,
  L_PARCEL_SHAPE_OUT,
  L_PROV_FILL,
  L_PROV_GLOW,
  L_PROV_OUT,
} from "./map.config";

type ProvDistMode = "prov-region" | "prov-city" | "dist";

export type MapPolygonLayerProps =
  | {
      mode: ProvDistMode;
      data: FeatureCollection;
      fillPaint: Record<string, unknown>;
      lineGlowPaint: Record<string, unknown>;
      lineOutPaint: Record<string, unknown>;
      sourceId: string;
      promoteId?: string;
    }
  | {
      mode: "parcel-focus";
      data: FeatureCollection;
      sourceId: string;
    }
  | {
      mode: "parcel-shapes";
      data: FeatureCollection;
      sourceId: string;
      promoteId?: string;
    };

export function MapPolygonLayer(props: MapPolygonLayerProps) {
  if (props.mode === "parcel-shapes") {
    return (
      <Source id={props.sourceId} type="geojson" data={props.data} promoteId={(props.promoteId ?? "id") as string}>
        <Layer
          id={L_PARCEL_SHAPE_FILL}
          type="fill"
          paint={{
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "rgba(184,134,11,0.28)",
              "rgba(184,134,11,0.14)",
            ],
            "fill-opacity": 1,
          }}
        />
        <Layer
          id={L_PARCEL_SHAPE_GLOW}
          type="line"
          paint={{
            "line-color": "rgba(184,134,11,0.4)",
            "line-width": 3,
            "line-blur": 1.4,
            "line-opacity": 1,
          }}
        />
        <Layer
          id={L_PARCEL_SHAPE_OUT}
          type="line"
          paint={{
            "line-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              "rgba(138,106,10,0.95)",
              "rgba(184,134,11,0.9)",
            ],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              2.2,
              1.3,
            ],
            "line-opacity": 1,
          }}
        />
      </Source>
    );
  }

  if (props.mode === "parcel-focus") {
    return (
      <Source id={props.sourceId} type="geojson" data={props.data}>
        <Layer
          id={L_FOCUS_FILL}
          type="fill"
          paint={{
            "fill-color": "rgba(184,134,11,0.06)",
            "fill-opacity": 0.18,
          }}
        />
        <Layer
          id={L_FOCUS_GLOW}
          type="line"
          paint={{
            "line-color": "rgba(184,134,11,0.55)",
            "line-width": 6,
            "line-blur": 2,
            "line-opacity": 1,
          }}
        />
        <Layer
          id={L_FOCUS_OUT}
          type="line"
          paint={{
            "line-color": "rgba(138,106,10,0.9)",
            "line-width": 1.6,
            "line-opacity": 1,
          }}
        />
      </Source>
    );
  }

  const { data, fillPaint, lineGlowPaint, lineOutPaint, sourceId, promoteId } = props;
  const isProv = props.mode === "prov-region" || props.mode === "prov-city";
  const fillId = isProv ? L_PROV_FILL : L_DIST_FILL;
  const glowId = isProv ? L_PROV_GLOW : L_DIST_GLOW;
  const outId = isProv ? L_PROV_OUT : L_DIST_OUT;
  const key = props.mode === "prov-region" ? "prov-all" : props.mode === "prov-city" ? "prov-filtered" : "dist";

  return (
    <Source key={key} id={sourceId} type="geojson" data={data} promoteId={(promoteId ?? "id") as string}>
      <Layer id={fillId} type="fill" paint={fillPaint} />
      <Layer id={glowId} type="line" paint={lineGlowPaint} />
      <Layer id={outId} type="line" paint={lineOutPaint} />
    </Source>
  );
}
