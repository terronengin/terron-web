import { getDailyValuationRate } from "./sim/realEstatePrice";
import { getDemandPressure, type TerronPropertyPricingInput } from "./propertySalePrice";

/** Sabit referans gün — deterministik simülasyonda "bugün" olarak kullanılır (aynı arsa her zaman aynı sonucu verir). */
const TREND_REF_DAY = 90;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function toSimProperty(p: TerronPropertyPricingInput) {
  const risk01 = clamp01((p.risk_score ?? 50) / 100);
  const dev01 = clamp01((p.development_score ?? 50) / 100);
  const quality01 =
    p.quality_score != null ? clamp01(Number(p.quality_score)) : clamp01(0.55 + dev01 * 0.2 - risk01 * 0.1);
  const rentalYield = p.rental_yield_annual != null ? clamp01(Number(p.rental_yield_annual)) : 0.05;
  return {
    id: p.id,
    area_m2: Math.max(1, Number(p.total_area_m2 ?? 1)),
    quality_score: quality01,
    development_score: dev01,
    risk_score: risk01,
    rental_yield_annual: rentalYield,
    demand_score: getDemandPressure(p),
    buy_pressure_count: Math.round(Number(p.sold_m2 ?? 0) / Math.max(1, Number(p.min_buy_m2 ?? 1))),
    buy_pressure_m2: Number(p.sold_m2 ?? 0),
    sell_pressure_count: 0,
    sell_pressure_m2: 0,
    // getDailyValuationRate bu alanı okumuyor; tip uyumu için sabit değerlerle dolduruluyor.
    area: { base_m2_price: 1000, expected_real_return_annual: 0.03, inflation_annual: 0, vol_annual: 0.12 },
  };
}

/** Ucuz — tek günlük oran, kart üzerindeki "24 saat" rozeti için. */
export function getDailyChangePct(p: TerronPropertyPricingInput, seedScope: string): number {
  const sim = toSimProperty(p);
  return getDailyValuationRate(sim, TREND_REF_DAY, seedScope) * 100;
}

export type PriceTrend = { daily: number; weekly: number; monthly: number };

/** Günlük/haftalık/aylık simüle fiyat eğilimi (%) — yalnızca genişletilen kart için (lazy) hesaplanmalı. */
export function computePriceTrend(p: TerronPropertyPricingInput, seedScope: string): PriceTrend {
  const sim = toSimProperty(p);
  const rates: number[] = [];
  for (let d = 1; d <= TREND_REF_DAY; d++) {
    rates.push(getDailyValuationRate(sim, d, seedScope));
  }
  const daily = rates[TREND_REF_DAY - 1] ?? 0;
  const weekly = rates.slice(TREND_REF_DAY - 7).reduce((acc, r) => acc * (1 + r), 1) - 1;
  const monthly = rates.slice(TREND_REF_DAY - 30).reduce((acc, r) => acc * (1 + r), 1) - 1;
  return { daily: daily * 100, weekly: weekly * 100, monthly: monthly * 100 };
}
