import { simulatePropertyPriceTRY } from "@/lib/sim/realEstatePrice";

/** Panel / harita / işlem için tek m² fiyatı (DB liste alanı + talep simülasyonu). */
export type TerronPropertyPricingInput = {
  id: string;
  price_per_m2?: number | null;
  total_area_m2?: number | null;
  available_m2?: number | null;
  sold_m2?: number | null;
  development_score?: number | null;
  last_30d_change?: number | null;
  quality_score?: number | null;
  risk_score?: number | null;
  rental_yield_annual?: number | null;
  min_buy_m2?: number | null;
  total_shares?: number | null;
  area?: {
    id: string;
    base_m2_price: number;
    expected_real_return_annual?: number | null;
    inflation_annual?: number | null;
    vol_annual?: number | null;
    cycle_strength?: number | null;
    shock_prob_annual?: number | null;
    shock_size?: number | null;
  } | null;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getPropertyAvailableM2(p: TerronPropertyPricingInput | null) {
  if (!p) return 0;
  const total = Number(p.total_area_m2 ?? 0);
  const available =
    p.available_m2 != null ? Number(p.available_m2) : Math.max(0, total - Number(p.sold_m2 ?? 0));
  return Math.max(0, available);
}

function getPropertySoldM2(p: TerronPropertyPricingInput | null) {
  if (!p) return 0;
  const total = Number(p.total_area_m2 ?? 0);
  if (p.sold_m2 != null) return Math.max(0, Number(p.sold_m2));
  return Math.max(0, total - getPropertyAvailableM2(p));
}

/** Talep göstergesi (0–1); panelde “Talep %” için */
export function getDemandPressure(p: TerronPropertyPricingInput | null) {
  if (!p) return 0;
  const sold = getPropertySoldM2(p);
  const total = Math.max(1, Number(p.total_area_m2 ?? 1));
  const soldRatio = sold / total;
  const demandFromSold = soldRatio * 0.65;
  const demandFromDev = clamp01(Number(p.development_score ?? 50) / 100) * 0.22;
  const demandFromTrend = clamp01((Number(p.last_30d_change ?? 0) + 12) / 24) * 0.13;
  return clamp01(demandFromSold + demandFromDev + demandFromTrend);
}

function getRealEstateSim(p: TerronPropertyPricingInput, seedScope: string) {
  if (!p.area || !p.total_area_m2 || p.total_area_m2 <= 0) return null;
  const risk01 = clamp01((p.risk_score ?? 50) / 100);
  const dev01 = clamp01((p.development_score ?? 50) / 100);
  const quality01 =
    p.quality_score != null
      ? clamp01(Number(p.quality_score))
      : clamp01(0.55 + dev01 * 0.2 - risk01 * 0.1);
  const rentalYield = p.rental_yield_annual != null ? clamp01(Number(p.rental_yield_annual)) : 0.05;
  const propertyForSim = {
    id: p.id,
    area_m2: Number(p.total_area_m2),
    quality_score: quality01,
    development_score: dev01,
    risk_score: risk01,
    rental_yield_annual: rentalYield,
    demand_score: getDemandPressure(p),
    buy_pressure_count: Math.round(Number(p.sold_m2 ?? 0) / Math.max(1, Number(p.min_buy_m2 ?? 1))),
    buy_pressure_m2: Number(p.sold_m2 ?? 0),
    sell_pressure_count: 0,
    sell_pressure_m2: 0,
    area: {
      id: p.area.id,
      base_m2_price: Number(p.area.base_m2_price),
      expected_real_return_annual: Number(p.area.expected_real_return_annual ?? 0.03),
      inflation_annual: Number(p.area.inflation_annual ?? 0.0),
      vol_annual: Number(p.area.vol_annual ?? 0.12),
      cycle_strength: Number(p.area.cycle_strength ?? 0.6),
      shock_prob_annual: Number(p.area.shock_prob_annual ?? 0.06),
      shock_size: Number(p.area.shock_size ?? -0.08),
    },
  };
  const out = simulatePropertyPriceTRY(propertyForSim as Parameters<typeof simulatePropertyPriceTRY>[0], 0, seedScope);
  const totalShares = Number(p.total_shares ?? 100000);
  const sharePrice = out.price / Math.max(1, totalShares);
  return { ...out, sharePrice, totalShares };
}

/**
 * Alım ve satışta kullanılacak tek m² fiyatı (görünen / satış tutarı).
 */
export function getTerronSalePricePerM2(p: TerronPropertyPricingInput | null, seedScope: string): number {
  if (!p) return 0;
  const baseSim =
    getRealEstateSim(p, seedScope)?.pricePerM2 ||
    Number(p.price_per_m2 ?? 0) ||
    Number(p.area?.base_m2_price ?? 0) ||
    1;
  const pressure = getDemandPressure(p);
  const demandPremium = 1 + pressure * 0.16;
  const lowDemandPenalty = pressure < 0.22 ? 1 - (0.22 - pressure) * 0.1 : 1;
  return Math.max(1, baseSim * demandPremium * lowDemandPenalty);
}
