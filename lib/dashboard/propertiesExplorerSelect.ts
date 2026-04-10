/**
 * Dashboard / explorer için Supabase `select()` — yalnızca migrasyonlarda tanımlı kolonlar.
 * Şemada olmayan bir alan tüm sorguyu düşürür (ilanlar kaybolmuş gibi görünür).
 *
 * İstemci `normalizePropertyForPanel` → `derivePropertyInvestment` ile eksik metrik/imar/arazi
 * alanlarını zaten tamamlar; DB'de `zoning_band` / `land_type` olması şart değildir.
 */
export const PROPERTIES_EXPLORER_SELECT = [
  "id",
  "title",
  "city",
  "district",
  "neighborhood",
  "latitude",
  "longitude",
  "price_per_m2",
  "total_area_m2",
  "available_m2",
  "sold_m2",
  "min_buy_m2",
  "max_buy_m2",
  "zoning_status",
  "risk_score",
  "development_score",
  "expected_annual_return",
  "last_30d_change",
  "liquidity_score",
  "rental_yield_annual",
  "quality_score",
  "ai_summary",
  "growth_story",
  "risk_factors",
  "listing_description",
  "created_at",
  "listing_status",
  "is_real",
].join(",");
