import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

export type MapItem = {
  id: string;
  propertyId?: string | null;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
  country?: string | null;
  price_per_m2?: number | null;
  total_area_m2?: number;
  available_m2?: number | null;
  sold_m2?: number | null;
  min_buy_m2?: number | null;
  max_buy_m2?: number | null;
  zoning_status?: string | null;
  is_real?: boolean | null;
  listing_status?: string | null;
  listing_description?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  is_verified?: boolean | null;
  ada_no?: string | null;
  parcel_no?: string | null;
};

export type MapLevel = "region" | "city" | "district" | "neighborhood" | "parcel";

export type CountPointProps = {
  id: string;
  name: string;
  count: number;
  city?: string;
  district?: string;
  neighborhood?: string;
  region?: string;
  level?: MapLevel;
};

export type PipelineStats = {
  total: number;
  valid: number;
  ignored: number;
  usedFallback: boolean;
};

/** Harita seçimi (props.selected) — MapItem ile uyumlu koordinat alanları */
export type MapViewSelected = {
  id: string;
  title: string;
  city: string;
  district: string | null;
  neighborhood: string | null;
  latitude: number;
  longitude: number;
};

export type MapViewProps = {
  items: MapItem[];
  selected?: MapViewSelected | null;
  filters?: {
    city?: string;
    district?: string;
    neighborhood?: string;
    searchText?: string;
  } | null;
  onSetCity?: (city: string) => void;
  onSetDistrict?: (district: string) => void;
  onSetNeighborhood?: (neighborhood: string) => void;
  onSelectPropertyId?: (id: string) => void;
  onOpenInfo?: () => void;
  onPropertyClick?: (property: MapItem) => void;
  onOpenPropertyPanel?: () => void;
};

export type ActivePolyConfig = {
  src: string;
  fill: string;
  glow: string;
  out: string;
} | null;

/** Genişletilebilir bbox (mutable build sırasında) */
export type HierarchyBoundsDraft = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  empty: boolean;
};

/** finalizeBounds sonrası salt okunur sınırlar */
export type HierarchyBounds = {
  readonly minLng: number;
  readonly minLat: number;
  readonly maxLng: number;
  readonly maxLat: number;
};

export type HierarchyLevel = "region" | "city" | "district" | "neighborhood" | "parcel";

export type HierarchyNodeBase = {
  readonly key: string;
  readonly name: string;
  readonly parentKeys: readonly string[];
  readonly count: number;
  readonly center: [number, number] | null;
  readonly bounds: HierarchyBounds | null;
  readonly childKeys: readonly string[];
  readonly items: readonly MapItem[];
  readonly level: HierarchyLevel;
};

export type HierarchyRegionNode = HierarchyNodeBase & { readonly level: "region" };
export type HierarchyCityNode = HierarchyNodeBase & { readonly level: "city" };
export type HierarchyDistrictNode = HierarchyNodeBase & { readonly level: "district" };
export type HierarchyNeighborhoodNode = HierarchyNodeBase & { readonly level: "neighborhood" };
export type HierarchyParcelNode = HierarchyNodeBase & {
  readonly level: "parcel";
  readonly count: 1;
  readonly childKeys: readonly [];
};

export type HierarchyIndex = {
  readonly regionsByKey: Readonly<Record<string, HierarchyRegionNode>>;
  readonly citiesByKey: Readonly<Record<string, HierarchyCityNode>>;
  readonly districtsByKey: Readonly<Record<string, HierarchyDistrictNode>>;
  readonly neighborhoodsByKey: Readonly<Record<string, HierarchyNeighborhoodNode>>;
  readonly parcelsByKey: Readonly<Record<string, HierarchyParcelNode>>;
  /** Koordinatı geçerli tüm öğeler (tek referans dizisi) */
  readonly allItems: readonly MapItem[];
  /**
   * Gerçek koordinat, ilgili ilçe poligonu / parent bounds ile uyumsuz (stableMapItemId).
   * Haritada sentetik konuma düşürülür; analiz için set.
   */
  readonly coordOutsideParentByItemId: ReadonlySet<string>;
};

export type BuildHierarchyIndexOptions = {
  /** Varsa parsel için nokta yerine polygon bbox kullanılır */
  getPolygonBounds?: (item: MapItem) => HierarchyBounds | null;
  /** GADM ilçe GeoJSON — koordinatın ilçe sınırı içinde doğrulanması */
  distGeo?: FeatureCollection | null;
};

export type { Feature, FeatureCollection, Point, Polygon };
