/**
 * Arsa üret (seed) insert — yalnızca gerçek tablo kolonları.
 * `source_type` veya şemada olmayan kolonlar gönderilmez.
 * `zoning_band` kolonu yoksa listede tutulmaz (keşif filtresi için `normalizePropertyForPanel` türetir).
 */
import { LISTING_STATUS_DB_VALUES, type ListingStatusDb } from "@/lib/propertyListingStatus";
export const SEED_PROPERTY_INSERT_KEYS = [
  "id",
  "title",
  "city",
  "district",
  "neighborhood",
  "price_per_m2",
  "total_area_m2",
  "available_m2",
  "sold_m2",
  "latitude",
  "longitude",
  "min_buy_m2",
  "max_buy_m2",
  "risk_score",
  "development_score",
  "expected_annual_return",
  "last_30d_change",
  "zoning_status",
  "liquidity_score",
  "ai_summary",
  "growth_story",
  "risk_factors",
  "land_type",
  /** Yayın / harita için (çoğu şemada NOT NULL) */
  "listing_status",
  "is_real",
] as const;

export type SeedValidationIssue = { index: number; reason: string };

export function pickSeedPropertyInsert(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of SEED_PROPERTY_INSERT_KEYS) {
    if (k in row) out[k] = row[k];
  }
  return out;
}

export function validateSeedRowForInsert(
  row: Record<string, unknown>,
  index: number
): { ok: true; row: Record<string, unknown> } | { ok: false; issue: SeedValidationIssue } {
  const requiredStr = ["title", "city", "district", "neighborhood", "listing_status"] as const;
  for (const k of requiredStr) {
    const v = row[k];
    if (v == null || (typeof v === "string" && !String(v).trim())) {
      return { ok: false, issue: { index, reason: `Eksik veya boş alan: ${k}` } };
    }
  }

  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, issue: { index, reason: "latitude/longitude geçersiz" } };
  }

  const total = Number(row.total_area_m2);
  const available = Number(row.available_m2);
  const sold = Number(row.sold_m2);
  const price = Number(row.price_per_m2);
  const minB = Number(row.min_buy_m2);
  const maxB = Number(row.max_buy_m2);

  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available) || !Number.isFinite(sold)) {
    return { ok: false, issue: { index, reason: "total_area_m2 / available_m2 / sold_m2 geçersiz" } };
  }
  if (!Number.isFinite(price) || price < 0 || Number.isNaN(price)) {
    return { ok: false, issue: { index, reason: "price_per_m2 geçersiz" } };
  }
  if (!Number.isFinite(minB) || !Number.isFinite(maxB)) {
    return { ok: false, issue: { index, reason: "min_buy_m2 / max_buy_m2 geçersiz" } };
  }
  if (available > total + 1e-6) {
    return { ok: false, issue: { index, reason: "available_m2 total_area_m2 üstünde" } };
  }
  if (available < 0 || sold < 0) {
    return { ok: false, issue: { index, reason: "available_m2 veya sold_m2 negatif" } };
  }
  if (minB > maxB) {
    return { ok: false, issue: { index, reason: "min_buy_m2 max_buy_m2 üstünde" } };
  }

  const allowedListing = new Set<string>(LISTING_STATUS_DB_VALUES);
  const ls = String(row.listing_status).trim();
  if (!allowedListing.has(ls)) {
    return { ok: false, issue: { index, reason: `listing_status izinli değil: ${ls}` } };
  }

  const sanitized = pickSeedPropertyInsert(row);
  sanitized.latitude = lat;
  sanitized.longitude = lng;
  sanitized.total_area_m2 = Math.round(total);
  sanitized.available_m2 = Math.round(available);
  sanitized.sold_m2 = Math.round(sold);
  sanitized.price_per_m2 = Math.round(price);
  sanitized.min_buy_m2 = Math.round(minB);
  sanitized.max_buy_m2 = Math.round(maxB);
  if ("is_real" in sanitized) sanitized.is_real = Boolean(sanitized.is_real);
  sanitized.listing_status = ls as ListingStatusDb;

  return { ok: true, row: sanitized };
}
