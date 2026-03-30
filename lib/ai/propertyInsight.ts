import type { TurkeyRegionName } from "@/lib/regions/trRegions";

type InsightInput = {
  city: string;
  region: TurkeyRegionName;
  pricePerM2: number;
  riskScore: number;
  developmentScore: number;
  liquidityScore: number;
  zoning: string;
  rng: () => number;
};

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function buildAiSummary(i: InsightInput): string {
  const { city, region, pricePerM2, developmentScore, liquidityScore, rng } = i;
  const a = [
    `${city} çevresinde talep gören bir parsel hattı; bölgesel likidite skoru ${liquidityScore} seviyesinde.`,
    `Fiyat bandı ₺${Math.round(pricePerM2).toLocaleString("tr-TR")}/m² civarında işlem gören benzer arsalarla uyumlu.`,
    `${region} bölgesinde gelişim göstergesi %${developmentScore} olarak öne çıkıyor.`,
  ];
  return pick(a, rng);
}

export function buildGrowthStory(i: InsightInput): string {
  const { city, region, rng } = i;
  const g = [
    `${city}: ulaşım aksları ve planlı alan genişlemesi ile orta vadede değer birikimi izleniyor.`,
    `${region} özelinde konut ve karma kullanım talebi, arsa tarafında kademeli fiyatlanmayı destekliyor.`,
    `Yerel plan notları ve yatırım yoğunluğu, bölgenin büyüme öyküsünü güçlendiriyor.`,
  ];
  return pick(g, rng);
}

export function buildRiskFactors(i: InsightInput): string {
  const { city, riskScore, zoning, rng } = i;
  const r = [
    `Risk profili %${riskScore}; imar statüsü (${zoning}) ve çevresel gelişim belirsizlikleri dikkate alınmalı.`,
    `${city} için düzenleyici süreçler ve altyapı zamanlaması ana risk kalemleri arasında.`,
    `Piyasa volatilitesi ve likidite dalgalanmaları, çıkış stratejisinde esneklik gerektirebilir.`,
  ];
  return pick(r, rng);
}
