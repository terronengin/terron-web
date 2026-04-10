/**
 * Dashboard harita + panel için birleşik satır tipi (Supabase).
 */
export type PropertyRow = {
  id: string;
  title: string;
  country?: string | null;
  city: string;
  district: string | null;
  neighborhood?: string | null;
  zoning_status?: string | null;
  zoning_band?: string | null;
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
  region?: string | null;
  parcel_code?: string | null;
  owner_display_name?: string | null;
  liquidity_score?: number | null;
  confidence_score?: number | null;
  location_quality_score?: number | null;
  ai_summary?: string | null;
  growth_story?: string | null;
  risk_factors?: string | null;
  land_type?: string | null;
  investment_thesis?: string | null;
  around_text?: string | null;
  summary_line?: string | null;
};

