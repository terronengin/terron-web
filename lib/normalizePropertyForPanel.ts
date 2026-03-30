/**
 * Dashboard sağ paneli için property nesnesini güvenli sayı/metin varsayılanlarıyla doldurur.
 * Gerçek ilan (submit-property) kayıtlarında eksik alanlar yüzünden render kırılmasını önler.
 */

import { normalizeLatLngPair, isValidLatLng } from "@/lib/geoCoords";

export type PropertyPanelShape = {
  id: string;
  title: string;
  country?: string | null;
  city: string;
  district: string | null;
  neighborhood?: string | null;
  zoning_status?: string | null;
  price_per_m2?: number | null;
  total_area_m2: number;
  available_m2?: number | null;
  sold_m2?: number | null;
  min_buy_m2?: number | null;
  max_buy_m2?: number | null;
  risk_score: number;
  development_score: number;
  expected_annual_return: number;
  last_30d_change: number;
  latitude: number | null;
  longitude: number | null;
  quality_score?: number;
  rental_yield_annual?: number;
  total_shares?: number;
  area?: unknown | null;
  is_real?: boolean | null;
  listing_status?: string | null;
  listing_description?: string | null;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  is_verified?: boolean | null;
  deed_image_url?: string | null;
  ada_no?: string | null;
  parcel_no?: string | null;
  ai_summary?: string | null;
  growth_story?: string | null;
  risk_factors?: string | null;
  liquidity_score?: number | null;
  confidence_score?: number | null;
};

function num(x: unknown, fallback: number): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function normalizePropertyForPanel(p: Partial<PropertyPanelShape> & { id: string }): PropertyPanelShape {
  const id = String(p.id ?? "").trim() || `prop_${Date.now()}`;
  const totalRaw = numOrNull(p.total_area_m2);
  const total = totalRaw != null && totalRaw > 0 ? totalRaw : 1;

  const soldRaw = numOrNull(p.sold_m2);
  const availRaw = numOrNull(p.available_m2);
  const sold = soldRaw != null && soldRaw >= 0 ? soldRaw : 0;
  const available =
    availRaw != null && availRaw >= 0 ? availRaw : Math.max(0, total - sold);

  const city = String(p.city ?? "").trim() || "—";
  const district = p.district != null && String(p.district).trim() !== "" ? String(p.district).trim() : null;
  const neighborhood =
    p.neighborhood != null && String(p.neighborhood).trim() !== "" ? String(p.neighborhood).trim() : null;

  const latRaw = numOrNull(p.latitude);
  const lngRaw = numOrNull(p.longitude);
  const pair = normalizeLatLngPair(latRaw, lngRaw);
  const latitude =
    pair && isValidLatLng(pair.latitude, pair.longitude) ? pair.latitude : latRaw ?? null;
  const longitude =
    pair && isValidLatLng(pair.latitude, pair.longitude) ? pair.longitude : lngRaw ?? null;

  const desc =
    (p.listing_description != null && String(p.listing_description).trim() !== ""
      ? String(p.listing_description).trim()
      : null) ||
    (typeof (p as any).description === "string" && String((p as any).description).trim() !== ""
      ? String((p as any).description).trim()
      : null) ||
    "Açıklama yakında eklenecek.";

  return {
    ...p,
    id,
    title: String(p.title ?? "Arsa").trim() || "Arsa",
    country: p.country ?? null,
    city,
    district,
    neighborhood: neighborhood ?? null,
    zoning_status: (p.zoning_status as string) ?? "bilinmiyor",
    price_per_m2: p.price_per_m2 != null ? num(p.price_per_m2, 0) : 0,
    total_area_m2: total,
    available_m2: available,
    sold_m2: sold,
    min_buy_m2: p.min_buy_m2 != null ? Math.max(1, num(p.min_buy_m2, 1)) : 1,
    max_buy_m2: p.max_buy_m2 != null ? num(p.max_buy_m2, available) : available,
    risk_score: num(p.risk_score, 50),
    development_score: num(p.development_score, 50),
    expected_annual_return: num(p.expected_annual_return, 12),
    last_30d_change: num(p.last_30d_change, 0),
    latitude,
    longitude,
    quality_score: p.quality_score,
    rental_yield_annual: p.rental_yield_annual,
    total_shares: p.total_shares,
    area: p.area ?? null,
    is_real: p.is_real ?? false,
    listing_status: p.listing_status ?? null,
    listing_description: desc,
    owner_name: p.owner_name ?? null,
    owner_phone: p.owner_phone ?? null,
    owner_email: p.owner_email ?? null,
    is_verified: p.is_verified ?? null,
    deed_image_url: p.deed_image_url ?? null,
    ada_no: p.ada_no ?? null,
    parcel_no: p.parcel_no ?? null,
    ai_summary: p.ai_summary ?? null,
    growth_story: p.growth_story ?? null,
    risk_factors: p.risk_factors ?? null,
    liquidity_score: p.liquidity_score != null ? num(p.liquidity_score, 50) : undefined,
    confidence_score: p.confidence_score != null ? num(p.confidence_score, 0.7) : undefined,
  };
}
