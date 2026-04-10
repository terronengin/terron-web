/**
 * Harita / ilan paneli için bölgeye göre tutarlı, deterministik yatırım metrikleri ve metinleri.
 * Aynı ilan için her zaman aynı çıktı (id + konum + alan).
 */

import { findCitySeedByName, type CitySeed, type TurkeyRegionName } from "@/lib/regions/trRegions";

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fnv1a32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Şehir + bölge eksenleri — 0..1 ölçek */
export type RegionalAxisProfile = {
  growth: number;
  risk: number;
  demand: number;
  liquidity: number;
  zoningReliability: number;
  infrastructure: number;
  tourism: number;
  industrialPotential: number;
  volatility: number;
};

function baseProfileFromRegion(region: TurkeyRegionName): RegionalAxisProfile {
  switch (region) {
    case "Marmara":
      return {
        growth: 0.78,
        risk: 0.38,
        demand: 0.88,
        liquidity: 0.9,
        zoningReliability: 0.72,
        infrastructure: 0.9,
        tourism: 0.35,
        industrialPotential: 0.62,
        volatility: 0.11,
      };
    case "Ege":
      return {
        growth: 0.7,
        risk: 0.42,
        demand: 0.72,
        liquidity: 0.78,
        zoningReliability: 0.65,
        infrastructure: 0.74,
        tourism: 0.55,
        industrialPotential: 0.52,
        volatility: 0.14,
      };
    case "Akdeniz":
      return {
        growth: 0.68,
        risk: 0.46,
        demand: 0.75,
        liquidity: 0.72,
        zoningReliability: 0.62,
        infrastructure: 0.72,
        tourism: 0.72,
        industrialPotential: 0.48,
        volatility: 0.17,
      };
    case "İç Anadolu":
      return {
        growth: 0.62,
        risk: 0.36,
        demand: 0.58,
        liquidity: 0.68,
        zoningReliability: 0.7,
        infrastructure: 0.7,
        tourism: 0.22,
        industrialPotential: 0.58,
        volatility: 0.1,
      };
    case "Karadeniz":
      return {
        growth: 0.52,
        risk: 0.44,
        demand: 0.48,
        liquidity: 0.55,
        zoningReliability: 0.58,
        infrastructure: 0.62,
        tourism: 0.38,
        industrialPotential: 0.42,
        volatility: 0.13,
      };
    case "Doğu Anadolu":
      return {
        growth: 0.48,
        risk: 0.52,
        demand: 0.42,
        liquidity: 0.44,
        zoningReliability: 0.52,
        infrastructure: 0.55,
        tourism: 0.28,
        industrialPotential: 0.45,
        volatility: 0.19,
      };
    case "Güneydoğu Anadolu":
      return {
        growth: 0.56,
        risk: 0.5,
        demand: 0.52,
        liquidity: 0.52,
        zoningReliability: 0.54,
        infrastructure: 0.6,
        tourism: 0.25,
        industrialPotential: 0.62,
        volatility: 0.18,
      };
    default:
      return {
        growth: 0.58,
        risk: 0.45,
        demand: 0.55,
        liquidity: 0.58,
        zoningReliability: 0.6,
        infrastructure: 0.65,
        tourism: 0.35,
        industrialPotential: 0.5,
        volatility: 0.14,
      };
  }
}

/** Büyükşehir / turizm / sanayi kalemleri — CitySeed.region üzerine bindirme */
function cityFlavorAdjust(city: string, p: RegionalAxisProfile): RegionalAxisProfile {
  const c = city.trim();
  const out = { ...p };
  const metros = new Set(["İstanbul", "Ankara", "İzmir"]);
  const tourism = new Set(["Antalya", "Muğla", "Aydın", "Nevşehir", "Mersin", "Hatay"]);
  const industrial = new Set(["Kocaeli", "Bursa", "Gaziantep", "Konya", "Kayseri", "Adana"]);

  if (metros.has(c)) {
    out.demand += 0.08;
    out.liquidity += 0.06;
    out.growth += 0.06;
    out.infrastructure += 0.05;
    out.risk -= 0.04;
  }
  if (tourism.has(c)) {
    out.tourism += 0.18;
    out.volatility += 0.06;
    out.demand += 0.05;
  }
  if (industrial.has(c)) {
    out.industrialPotential += 0.12;
    out.infrastructure += 0.04;
  }
  if (c === "Nevşehir") {
    out.tourism += 0.22;
    out.volatility += 0.04;
  }

  return {
    growth: clamp(out.growth, 0.15, 0.95),
    risk: clamp(out.risk, 0.12, 0.9),
    demand: clamp(out.demand, 0.15, 0.98),
    liquidity: clamp(out.liquidity, 0.12, 0.98),
    zoningReliability: clamp(out.zoningReliability, 0.2, 0.92),
    infrastructure: clamp(out.infrastructure, 0.2, 0.95),
    tourism: clamp(out.tourism, 0.05, 0.95),
    industrialPotential: clamp(out.industrialPotential, 0.1, 0.92),
    volatility: clamp(out.volatility, 0.06, 0.28),
  };
}

function districtModifiers(district: string | null | undefined, city: string): {
  dev: number;
  risk: number;
  liq: number;
  tour: number;
  ind: number;
} {
  const d = String(district ?? "");
  let dev = 0;
  let risk = 0;
  let liq = 0;
  let tour = 0;
  let ind = 0;

  if (/merkez|bahçe|yeni yerleşim/i.test(d)) {
    dev += 8;
    liq += 6;
    risk -= 4;
  }
  if (/sahil|kıyı|kumsal/i.test(d)) {
    tour += 10;
    liq += 4;
    risk += 3;
  }
  if (/sanayi|organize/i.test(d)) {
    ind += 14;
    dev += 4;
    risk += 5;
  }
  if (/kuzey|yukarı/i.test(d)) {
    dev += 2;
    risk += 8;
    liq -= 6;
  }

  void city;
  return { dev, risk, liq, tour, ind };
}

function coordUrbanization(
  lat: number | null | undefined,
  lng: number | null | undefined,
  seed: CitySeed | null
): number {
  if (!seed || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return 0.5;
  const [clat, clng] = seed.center;
  const dlat = (lat - clat) * 111;
  const dlng = (lng - clng) * 85;
  const dist = Math.sqrt(dlat * dlat + dlng * dlng);
  const urban = clamp(1 - dist / 85, 0, 1);
  return urban;
}

export type InvestmentDeriveInput = {
  id: string;
  city: string;
  district?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  total_area_m2: number;
  available_m2?: number | null;
  sold_m2?: number | null;
  price_per_m2?: number | null;
};

/** Keşif filtresi: imarlı / imarsız / bilinmiyor */
export type ZoningBand = "imarli" | "imarsiz" | "bilinmiyor" | "mixed";

export function deriveZoningBandFromLabel(zoningLabel: string): ZoningBand {
  const s = zoningLabel.trim().toLowerCase();
  if (!s || s === "bilinmiyor") return "bilinmiyor";
  if (s === "imarli" || s === "imarsiz") return s === "imarli" ? "imarli" : "imarsiz";
  if (/konut|villa|ticaret|sanayi.*imar|imarlı|imarli/i.test(zoningLabel)) return "imarli";
  if (/tarla|bağ|bahçe|incelenmeli|imarsız|imarsiz/i.test(zoningLabel)) return "imarsiz";
  return "mixed";
}

export type InvestmentDeriveResult = {
  risk_score: number;
  development_score: number;
  expected_annual_return: number;
  last_30d_change: number;
  liquidity_score: number;
  zoning_status: string;
  zoning_band: ZoningBand;
  land_type: string;
  ai_summary: string;
  growth_story: string;
  risk_factors: string;
  investment_thesis: string;
  around_text: string;
  summary_line: string;
};

const ZONING_OPTIONS = [
  "Konut İmarlı",
  "Villa İmarlı",
  "Ticaret + Konut",
  "Sanayi İmarlı",
  "Tarla",
  "Bağ / Bahçe",
  "İmar Durumu İncelenmeli",
] as const;

const LAND_TYPES = ["Arsa", "Tarla", "Ticari Arsa", "Villa Parseli", "Sanayi Parseli"] as const;

export function derivePropertyInvestment(input: InvestmentDeriveInput): InvestmentDeriveResult {
  const key = [
    input.id,
    input.city,
    input.district ?? "",
    input.neighborhood ?? "",
    Math.round(input.total_area_m2),
    Math.round(Number(input.available_m2 ?? 0)),
    Math.round(Number(input.sold_m2 ?? 0)),
  ].join("|");

  const seed = fnv1a32(key);
  const rng = mulberry32(seed);
  const r = () => rng();
  const rSigned = () => r() * 2 - 1;

  const citySeed = findCitySeedByName(input.city);
  let profile = citySeed
    ? cityFlavorAdjust(citySeed.city, baseProfileFromRegion(citySeed.region))
    : baseProfileFromRegion("İç Anadolu");

  const dm = districtModifiers(input.district, input.city);
  profile = {
    ...profile,
    tourism: clamp(profile.tourism + dm.tour * 0.01, 0.05, 0.95),
    industrialPotential: clamp(profile.industrialPotential + dm.ind * 0.008, 0.1, 0.95),
    liquidity: clamp(profile.liquidity + dm.liq * 0.004, 0.12, 0.98),
  };

  const urban = coordUrbanization(input.latitude, input.longitude, citySeed ?? null);
  const urbanBoost = (urban - 0.5) * 18;

  let dev =
    profile.growth * 72 +
    profile.infrastructure * 10 +
    urbanBoost +
    dm.dev +
    r() * 14 -
    profile.risk * 6;
  let risk =
    profile.risk * 58 +
    (1 - profile.zoningReliability) * 12 +
    (1 - urban) * 10 +
    dm.risk +
    r() * 16 -
    profile.demand * 4;

  dev = clamp(dev, 15, 92);
  risk = clamp(risk, 10, 88);

  const coupling = (dev - 52) * 0.08;
  risk = clamp(risk - coupling + rSigned() * 5, 10, 88);
  dev = clamp(dev + rSigned() * 4, 15, 92);

  const liq =
    profile.liquidity * 78 +
    profile.demand * 12 +
    dm.liq * 0.5 +
    urban * 8 +
    r() * 12;

  const liquidity_score = Math.round(clamp(liq, 10, 95));

  const retBase =
    6.2 +
    (dev / 100) * 11 +
    ((100 - risk) / 100) * 7.5 +
    profile.demand * 4 +
    r() * 3.2;
  const expected_annual_return = Math.round(clamp(retBase, 6, 26) * 10) / 10;

  const trend =
    profile.volatility * 9 * rSigned() +
    (profile.tourism - 0.35) * 3 * rSigned() +
    (dev - 55) * 0.045 +
    rSigned() * 1.8;
  const last_30d_change = Math.round(clamp(trend, -4.5, 7.5) * 10) / 10;

  const zoningWeights = ZONING_OPTIONS.map((_, i) => {
    let w = 1;
    if (profile.tourism > 0.55 && (i === 1 || i === 4)) w += 2;
    if (profile.industrialPotential > 0.58 && i === 3) w += 2.2;
    if (urban > 0.55 && i <= 2) w += 1.5;
    if (urban < 0.42 && (i === 4 || i === 5 || i === 6)) w += 1.8;
    return w;
  });
  const zw = zoningWeights.reduce((a, b) => a + b, 0);
  let zPick = r() * zw;
  let zoning_status: (typeof ZONING_OPTIONS)[number] = ZONING_OPTIONS[0];
  for (let i = 0; i < ZONING_OPTIONS.length; i++) {
    zPick -= zoningWeights[i]!;
    if (zPick <= 0) {
      zoning_status = ZONING_OPTIONS[i]!;
      break;
    }
  }

  const land_type = pickLandTypeForZoning(zoning_status, r);

  const narratives = buildNarratives({
    city: input.city,
    district: input.district,
    zoning_status,
    land_type,
    dev,
    risk,
    last_30d_change,
    expected_annual_return,
    liquidity_score,
    profile,
    r,
  });

  const zoning_band = deriveZoningBandFromLabel(zoning_status);

  return {
    risk_score: Math.round(risk),
    development_score: Math.round(dev),
    expected_annual_return,
    last_30d_change,
    liquidity_score,
    zoning_status,
    zoning_band,
    land_type,
    ...narratives,
  };
}

function pickLandTypeForZoning(zoningStatus: string, r: () => number): string {
  const z = zoningStatus.toLowerCase();
  if (/villa/i.test(z)) return r() < 0.85 ? "Villa Parseli" : "Arsa";
  if (/sanayi/i.test(z)) return "Sanayi Parseli";
  if (/ticaret/i.test(z)) return r() < 0.7 ? "Ticari Arsa" : "Arsa";
  if (/tarla/i.test(z)) return r() < 0.55 ? "Tarla" : "Arsa";
  if (/bağ|bahçe/i.test(z)) return r() < 0.6 ? "Tarla" : "Arsa";
  if (/incelenmeli|bilinmiyor/i.test(z)) return pick(LAND_TYPES, r);
  if (/konut/i.test(z)) return r() < 0.75 ? "Arsa" : "Villa Parseli";
  return pick(LAND_TYPES, r);
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!;
}

function buildNarratives(ctx: {
  city: string;
  district: string | null | undefined;
  zoning_status: string;
  land_type: string;
  dev: number;
  risk: number;
  last_30d_change: number;
  expected_annual_return: number;
  liquidity_score: number;
  profile: RegionalAxisProfile;
  r: () => number;
}): {
  ai_summary: string;
  growth_story: string;
  risk_factors: string;
  investment_thesis: string;
  around_text: string;
  summary_line: string;
} {
  const { city, district, zoning_status, land_type, dev, risk, last_30d_change, expected_annual_return, r } =
    ctx;
  const loc = district ? `${city} ${district}` : city;
  const t = ctx.profile.tourism > 0.52;
  const ind = ctx.profile.industrialPotential > 0.58;

  const thesisPool = [
    `Düşük volatilliteye yakın profil: risk %${Math.round(risk)} ve likidite göstergesi birlikte dengeli bir bandda.`,
    `Büyüme odaklı senaryo: gelişim %${Math.round(dev)} ile talep tarafında kademeli fiyat keşfi öne çıkıyor.`,
    `Daha agresif getiri profili: beklenen yıllık %${expected_annual_return.toFixed(1)} ile ödül/risk dengesi yüksek tutulmalı.`,
    `Likidite-temelli yaklaşım: bölgede işlem derinliği ve ${land_type} sınıfı için tipik satış süreleri birlikte okunmalı.`,
  ];

  const aroundPool = t
    ? [
        `${loc} çevresinde turizm ve sezonluk talep, kısa vadeli fiyat hareketini etkileyebilir; ulaşım koridorları kritik.`,
        `Bölgede konaklama ve ikincil konut talebi, arazi sınıfına göre farklı hızda fiyatlanır.`,
        `Sahil veya rota yakını parsellerde talep dalgalanması daha belirgin olabilir.`,
      ]
    : ind
      ? [
          `${loc} hattında sanayi ve lojistik aksları, uzun vadeli arazi değerini destekleyen faktörler arasında.`,
          `Organize sanayi ve ana yol bağlantıları, ticari ve karma imarlı parsellerde talep oluşturur.`,
          `Bölgede üretim tabanı güçlü; arazi likiditesi işletme yerleşimine bağlı dalgalanır.`,
        ]
      : [
          `${loc} çevresinde konut ve yerleşim genişlemesi, altyapı yatırımlarıyla birlikte değerlendirilmeli.`,
          `Merkeze uzaklık ve ulaşım erişimi, gelişim skoru ile birlikte fiyat keşfini şekillendirir.`,
          `Yerel planlama kararları ve çevre yol projeleri, orta vadede talep yoğunluğunu etkiler.`,
        ];

  const summaryPool = [
    `${zoning_status} · ${land_type}. Son 30 gün fiyat eğilimi %${last_30d_change >= 0 ? "+" : ""}${last_30d_change.toFixed(1)}; yıllık beklenti %${expected_annual_return.toFixed(1)}.`,
    `Parsel profili: gelişim %${Math.round(dev)}, risk %${Math.round(risk)}. İmar sınıfı "${zoning_status}" için yerinde tapu ve plan incelemesi önerilir.`,
    `${city} ölçeğinde likidite göstergesi ${ctx.liquidity_score}/100 bandında; işlem süresi bölge ortalamasına yaklaşır.`,
  ];

  const growthPool = [
    `Son dönemde bölgede yerleşim ve altyapı baskısı gelişim skorunu (%${Math.round(dev)}) yukarı taşıyan ana faktörler arasında. Konut ve ticaret genişlemesi talep tarafını destekliyor.`,
    `Gelişim göstergesi %${Math.round(dev)}: merkez dışı bölgelerde kademeli değer artışı, ulaşım projeleriyle hız kazanabilir.`,
    `Yerel ekonomik aktivite ve imar sıkılığı, uzun vadeli fiyat eğilimini şekillendiriyor; kısa vadede %${last_30d_change.toFixed(1)} hareket okunabilir.`,
  ];

  const riskPool = [
    `Likidite ${ctx.liquidity_score}/100 bandında; risk %${Math.round(risk)} ile birlikte işlem süresi ve alıcı profili dikkatle izlenmeli.`,
    `İmar sınıfı "${zoning_status}" için plan değişiklikleri ve kadastro uyumu ana belirsizlik kaynaklarıdır.`,
    `Makro faiz ve kredi koşulları, arsa talebini etkileyebilir; bölgesel döngüye duyarlılık yüksek olabilir.`,
  ];

  return {
    investment_thesis: pick(thesisPool, r),
    around_text: pick(aroundPool, r),
    summary_line: pick(summaryPool, r),
    ai_summary: pick(summaryPool, r) + " " + pick(thesisPool, r),
    growth_story: pick(growthPool, r),
    risk_factors: pick(riskPool, r),
  };
}

export function getCityProfile(city: string, district: string | null | undefined): RegionalAxisProfile {
  const cs = findCitySeedByName(city);
  if (!cs) return baseProfileFromRegion("İç Anadolu");
  return cityFlavorAdjust(cs.city, baseProfileFromRegion(cs.region));
}

/** Aynı `derivePropertyInvestment` çıktısını adlandırılmış erişimcilerle dışa açar (test / entegrasyon). */
export function calculateDevelopmentScore(property: InvestmentDeriveInput): number {
  return derivePropertyInvestment(property).development_score;
}
export function calculateRiskScore(property: InvestmentDeriveInput): number {
  return derivePropertyInvestment(property).risk_score;
}
export function calculateExpectedAnnualReturn(property: InvestmentDeriveInput): number {
  return derivePropertyInvestment(property).expected_annual_return;
}
export function calculateLast30dChange(property: InvestmentDeriveInput): number {
  return derivePropertyInvestment(property).last_30d_change;
}
export function calculateLiquidityScore(property: InvestmentDeriveInput): number {
  return derivePropertyInvestment(property).liquidity_score;
}
export function pickZoningStatus(property: InvestmentDeriveInput): string {
  return derivePropertyInvestment(property).zoning_status;
}
export function generateAroundText(property: InvestmentDeriveInput): string {
  return derivePropertyInvestment(property).around_text;
}
export function generateSummaryText(property: InvestmentDeriveInput): string {
  return derivePropertyInvestment(property).summary_line;
}
export function generateInvestmentThesis(property: InvestmentDeriveInput): string {
  return derivePropertyInvestment(property).investment_thesis;
}

