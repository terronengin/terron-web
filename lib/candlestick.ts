import { getDailyValuationRate } from "./sim/realEstatePrice";
import { getDemandPressure, type TerronPropertyPricingInput } from "./propertySalePrice";

const TREND_REF_DAY = 400;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashUnit(seed: string): number {
  return hashSeed(seed) / 4294967296;
}

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
    area: { base_m2_price: 1000, expected_real_return_annual: 0.03, inflation_annual: 0, vol_annual: 0.12 },
  };
}

export type Candle = { day: number; open: number; high: number; low: number; close: number };

/** Günlük OHLC mumları — mevcut deterministik günlük getiri motorundan türetilir (aynı arsa hep aynı geçmişi verir). */
export function computeCandles(
  p: TerronPropertyPricingInput,
  seedScope: string,
  days: number,
  regionDemand?: number
): Candle[] {
  const sim = toSimProperty(p, regionDemand);
  const candles: Candle[] = [];
  let prevClose = 100;
  const startDay = Math.max(1, TREND_REF_DAY - days + 1);
  for (let d = startDay; d <= TREND_REF_DAY; d++) {
    const rate = getDailyValuationRate(sim, d, seedScope);
    const open = prevClose;
    const close = Math.max(0.01, open * (1 + rate));
    const wick = hashUnit(`${p.id}|wick|${d}`);
    const bodyMin = Math.min(open, close);
    const bodyMax = Math.max(open, close);
    const spread = (bodyMax - bodyMin || bodyMax * 0.002) * (0.5 + wick);
    candles.push({
      day: d,
      open,
      close,
      high: bodyMax + spread * 0.6,
      low: Math.max(0.01, bodyMin - spread * 0.6),
    });
    prevClose = close;
  }
  return candles;
}

export function computeSMA(candles: Candle[], period: number): (number | null)[] {
  const closes = candles.map((c) => c.close);
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j]!;
    out.push(sum / period);
  }
  return out;
}

/** RSI(period) — Wilder'ın klasik formülü. */
export function computeRSI(candles: Candle[], period = 14): (number | null)[] {
  const closes = candles.map((c) => c.close);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export const CHART_PERIODS = [
  { key: "1g", label: "1G", days: 2 },
  { key: "1h", label: "1H", days: 7 },
  { key: "1a", label: "1A", days: 30 },
  { key: "3a", label: "3A", days: 90 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "5y", label: "5Y", days: TREND_REF_DAY },
] as const;
