import { getDailyValuationRate } from "./sim/realEstatePrice";
import { getDemandPressure, type TerronPropertyPricingInput } from "./propertySalePrice";

/** Sabit referans gün — deterministik simülasyonda "bugün" olarak kullanılır (aynı arsa her zaman aynı sonucu verir). */
const TREND_REF_DAY = 400;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

/**
 * @param regionDemand 0..1 — bulunduğu bölgenin (il) ortalama alım yoğunluğu.
 * Verilirse arsanın kendi talebiyle harmanlanır: bölgede alım çoksa artış eğilimi güçlenir.
 */
function toSimProperty(p: TerronPropertyPricingInput, regionDemand?: number) {
  const risk01 = clamp01((p.risk_score ?? 50) / 100);
  const dev01 = clamp01((p.development_score ?? 50) / 100);
  const quality01 =
    p.quality_score != null ? clamp01(Number(p.quality_score)) : clamp01(0.55 + dev01 * 0.2 - risk01 * 0.1);
  const rentalYield = p.rental_yield_annual != null ? clamp01(Number(p.rental_yield_annual)) : 0.05;
  const ownDemand = getDemandPressure(p);
  const demand = regionDemand != null ? clamp01(ownDemand * 0.4 + regionDemand * 0.6) : ownDemand;
  return {
    id: p.id,
    area_m2: Math.max(1, Number(p.total_area_m2 ?? 1)),
    quality_score: quality01,
    development_score: dev01,
    risk_score: risk01,
    rental_yield_annual: rentalYield,
    demand_score: demand,
    buy_pressure_count: Math.round(Number(p.sold_m2 ?? 0) / Math.max(1, Number(p.min_buy_m2 ?? 1))),
    buy_pressure_m2: Number(p.sold_m2 ?? 0),
    sell_pressure_count: 0,
    sell_pressure_m2: 0,
    // getDailyValuationRate bu alanı okumuyor; tip uyumu için sabit değerlerle dolduruluyor.
    area: { base_m2_price: 1000, expected_real_return_annual: 0.03, inflation_annual: 0, vol_annual: 0.12 },
  };
}

/** Ucuz — tek günlük oran, kart üzerindeki "24 saat" rozeti için. */
export function getDailyChangePct(p: TerronPropertyPricingInput, seedScope: string, regionDemand?: number): number {
  const sim = toSimProperty(p, regionDemand);
  return getDailyValuationRate(sim, TREND_REF_DAY, seedScope) * 100;
}

export type TrendSeries = {
  /** Gün 0'dan bugüne kadar kümülatif fiyat endeksi (100 = başlangıç); grafik için. */
  index: number[];
  /** Son `days` günün kümülatif değişimi (%), borsa uygulamalarındaki periyot butonları için. */
  changeOver(days: number): number;
};

/** Yalnızca açılan kart için (lazy) — tam seri, grafik + periyot butonları burada hesaplanır. */
export function computeTrendSeries(
  p: TerronPropertyPricingInput,
  seedScope: string,
  regionDemand?: number
): TrendSeries {
  const sim = toSimProperty(p, regionDemand);
  const rates: number[] = [];
  for (let d = 1; d <= TREND_REF_DAY; d++) rates.push(getDailyValuationRate(sim, d, seedScope));

  const index: number[] = [100];
  for (const r of rates) index.push(index[index.length - 1]! * (1 + r));

  function changeOver(days: number): number {
    const n = Math.min(Math.max(1, days), index.length - 1);
    const start = index[index.length - 1 - n]!;
    const end = index[index.length - 1]!;
    return (end / start - 1) * 100;
  }

  return { index, changeOver };
}

export const TREND_PERIODS = [
  { key: "1g", label: "1G", days: 1 },
  { key: "1h", label: "1H", days: 7 },
  { key: "2h", label: "2H", days: 14 },
  { key: "1a", label: "1A", days: 30 },
  { key: "3a", label: "3A", days: 90 },
  { key: "6a", label: "6A", days: 180 },
  { key: "1y", label: "1Y", days: 365 },
] as const;
