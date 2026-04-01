/**
 * Poligon hover: feature-state yalnızca fill / line paint alanlarında (fill-color, fill-opacity, line-*).
 * Symbol layer layout ve çoğu layout alanında feature-state desteklenmez — MapPropertyLayers’ta symbol’de kullanılmaz.
 */

export function fillPaintRegionView(selectedPolyId: string | null) {
  return {
    "fill-color": [
      "case",
      ["==", ["get", "id"], selectedPolyId ?? ""],
      "rgba(245,215,110,0.16)",
      ["boolean", ["feature-state", "hover"], false],
      "rgba(245,215,110,0.11)",
      [
        "match",
        ["get", "region"],
        "Marmara",
        "rgba(93,173,226,0.11)",
        "Ege",
        "rgba(46,204,113,0.10)",
        "Akdeniz",
        "rgba(241,196,15,0.11)",
        "İç Anadolu",
        "rgba(155,89,182,0.10)",
        "Karadeniz",
        "rgba(52,152,219,0.11)",
        "Doğu Anadolu",
        "rgba(231,76,60,0.10)",
        "Güneydoğu Anadolu",
        "rgba(230,126,34,0.11)",
        "Diğer",
        "rgba(149,165,166,0.09)",
        "rgba(245,215,110,0.06)",
      ],
    ],
    "fill-opacity": [
      "case",
      ["==", ["get", "id"], selectedPolyId ?? ""],
      0.26,
      ["boolean", ["feature-state", "hover"], false],
      0.18,
      0.12,
    ],
  } as Record<string, unknown>;
}

export function fillPaintDefault(selectedPolyId: string | null) {
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
  } as Record<string, unknown>;
}

export function lineGlowPaint(selectedPolyId: string | null) {
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
  } as Record<string, unknown>;
}

export function lineOutPaint(selectedPolyId: string | null) {
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
  } as Record<string, unknown>;
}
