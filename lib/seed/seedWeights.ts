import type { CitySeed, TurkeyRegionName } from "@/lib/regions/trRegions";
import { DISTRICT_SUFFIXES } from "@/lib/regions/trRegions";

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function regionalDev01(region: TurkeyRegionName): number {
  switch (region) {
    case "Marmara":
      return 0.76;
    case "Ege":
      return 0.7;
    case "Akdeniz":
      return 0.68;
    case "İç Anadolu":
      return 0.62;
    case "Karadeniz":
      return 0.55;
    case "Doğu Anadolu":
      return 0.48;
    case "Güneydoğu Anadolu":
      return 0.54;
    default:
      return 0.6;
  }
}

/** Kıyı / büyük pazar — yüksek çarpan */
const COAST_OR_PRIME = new Set<string>([
  "İstanbul",
  "İzmir",
  "Antalya",
  "Mersin",
  "Adana",
  "Bursa",
  "Kocaeli",
  "Trabzon",
  "Samsun",
  "Hatay",
  "Muğla",
  "Çanakkale",
  "Tekirdağ",
  "Balıkesir",
  "Yalova",
  "Rize",
  "Giresun",
  "Ordu",
  "Zonguldak",
  "Sinop",
  "Edirne",
]);

/**
 * weight =
 *   areaFactor * 0.35 +
 *   developmentFactor * 0.25 +
 *   populationLikeFactor * 0.20 +
 *   coastalOrPrimeFactor * 0.10 +
 *   randomFactor * 0.10
 */
export function compositeCityWeight(city: CitySeed, cityIndex: number, rootSeed: number): number {
  const rng = mulberry32(hashString32(`${city.city}|${cityIndex}`) ^ rootSeed);
  const areaFactor = Math.log(1 + city.weight) / Math.log(1 + 22);
  const developmentFactor = regionalDev01(city.region);
  const populationLikeFactor = Math.min(1, city.weight / 22);
  const coastalOrPrimeFactor = COAST_OR_PRIME.has(city.city) ? 1 : 0.55;
  const randomFactor = 0.82 + rng() * 0.28;
  const w =
    areaFactor * 0.35 +
    developmentFactor * 0.25 +
    populationLikeFactor * 0.2 +
    coastalOrPrimeFactor * 0.1 +
    randomFactor * 0.1;
  return Math.max(0.08, w);
}

/** Geniş aralık — ilçeler arası adet farkı belirgin olsun (deterministik jitter ile). */
const DISTRICT_SHAPE = [2.15, 1.35, 0.98, 0.72, 0.52, 0.38, 0.28, 0.2];

/** İlçe slot ağırlıkları — Merkez ağırlıklı, güçlü deterministik titreşim */
export function districtSlotWeights(city: CitySeed, rootSeed: number): number[] {
  const rng = mulberry32(hashString32(`dist|${city.city}`) ^ rootSeed);
  return DISTRICT_SHAPE.map((b) => b * (0.72 + rng() * 0.55));
}

const NH_SHAPE = [1.55, 1.22, 1.05, 0.9, 0.78, 0.65, 0.55, 0.46, 0.38, 0.32, 0.26, 0.2];

/** Mahalle slot ağırlıkları (12 sentetik varyant) — belirgin farklı adetler */
export function neighborhoodSlotWeights(city: CitySeed, districtLabel: string, rootSeed: number): number[] {
  const rng = mulberry32(hashString32(`nh|${city.city}|${districtLabel}`) ^ rootSeed);
  return NH_SHAPE.map((b) => b * (0.62 + rng() * 0.62));
}

export function logSampleWeights(
  citySeeds: CitySeed[],
  cityWeights: number[],
  rootSeed: number
): void {
  const sample = ["Ankara", "İstanbul", "Sinop", "İzmir", "Konya"];
  for (const name of sample) {
    const ci = citySeeds.findIndex((x) => x.city === name);
    const c = ci >= 0 ? citySeeds[ci] : undefined;
    const wi = ci >= 0 ? cityWeights[ci] : undefined;
    if (c && wi != null) {
      console.log(`[weights] city ${name.toLowerCase()} weight ${wi.toFixed(4)} composite`);
    }
  }
  const ank = citySeeds.find((x) => x.city === "Ankara");
  if (ank) {
    const dw = districtSlotWeights(ank, rootSeed);
    for (let i = 0; i < Math.min(4, DISTRICT_SUFFIXES.length); i++) {
      const suf = DISTRICT_SUFFIXES[i]!;
      console.log(`[weights] district ankara ${suf.toLowerCase()} weight ${dw[i]!.toFixed(4)}`);
    }
  }
}

export function logAllocatedSummary(
  label: string,
  counts: number[],
  keys: string[],
  maxEntries = 16
): void {
  const pairs = keys.map((k, i) => ({ k, n: counts[i] ?? 0 })).filter((x) => x.n > 0);
  pairs.sort((a, b) => b.n - a.n);
  const top = pairs.slice(0, maxEntries).map((p) => `${p.k}:${p.n}`);
  console.log(`[counts] ${label}`, top.join(", "), pairs.length > maxEntries ? `…+${pairs.length - maxEntries}` : "");
}
