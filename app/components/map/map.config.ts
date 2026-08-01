/** Mapbox: center = [lng, lat] — Türkiye geneli (useMapCamera TURKEY ile uyumlu) */
export const MAP_CENTER_LNG = 35.2;
export const MAP_CENTER_LAT = 39.1;
export const MAP_ZOOM = 4.05;

/** Geçerli TR arsa aralığı (derece) */
export const TR_LAT_MIN = 35;
export const TR_LAT_MAX = 43;
export const TR_LNG_MIN = 25;
export const TR_LNG_MAX = 45;

export const TURKEY_REGIONS = [
  "Marmara",
  "Ege",
  "Akdeniz",
  "İç Anadolu",
  "Karadeniz",
  "Doğu Anadolu",
  "Güneydoğu Anadolu",
] as const;

export const SRC_PROV = "src-prov";
export const SRC_DIST = "src-dist";
export const SRC_COUNT = "src-count";
export const SRC_POINTS = "src-points";
export const SRC_FOCUS = "src-focus";
export const SRC_SELECTED = "src-selected";

/** Polygon GeoJSON source id’leri — MapPolygonLayer ile birebir eşleşmeli */
export const POLY_SOURCES = {
  region: SRC_PROV,
  city: SRC_PROV,
  district: SRC_DIST,
  neighborhood: SRC_DIST,
  parcelFocus: SRC_FOCUS,
} as const;

export const L_PROV_FILL = "prov-fill";
export const L_PROV_GLOW = "prov-glow";
export const L_PROV_OUT = "prov-out";

export const L_DIST_FILL = "dist-fill";
export const L_DIST_GLOW = "dist-glow";
export const L_DIST_OUT = "dist-out";

export const L_COUNT_GLOW = "count-glow";
export const L_COUNT_HEAD = "count-head";
export const L_COUNT_TEXT = "count-text";

export const L_FOCUS_FILL = "focus-fill";
export const L_FOCUS_GLOW = "focus-glow";
export const L_FOCUS_OUT = "focus-out";

export const L_SELECTED_GLOW = "selected-glow";
export const L_SELECTED_POINT = "selected-point";

/** Parsel seviyesinde nokta yerine gerçekçi şekilli arsa poligonu */
export const SRC_PARCEL_SHAPES = "src-parcel-shapes";
export const L_PARCEL_SHAPE_FILL = "parcel-shape-fill";
export const L_PARCEL_SHAPE_GLOW = "parcel-shape-glow";
export const L_PARCEL_SHAPE_OUT = "parcel-shape-out";

/** Gerçekçi parsel poligonları (~50-2000m²) parmakla dokunmak için çok küçük —
 * görünmez, geniş dairesel bir dokunma hedefi aynı merkez noktasına eklenir. */
export const SRC_PARCEL_HITAREA = "src-parcel-hitarea";
export const L_PARCEL_HITAREA = "parcel-hitarea";

/** Seçili ilan vurgusu (circle); eski symbol/point layer’lar kaldırıldı */
export const PROPERTY_POINT_LAYER_IDS = [L_SELECTED_GLOW, L_SELECTED_POINT] as const;

