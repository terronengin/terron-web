export type SimProperty = {
  id: string;
  area_m2: number;
  quality_score: number; // 0..1
  development_score: number; // 0..1
  risk_score: number; // 0..1
  rental_yield_annual: number; // 0..1

  area: {
    id?: string;
    base_m2_price: number;
    expected_real_return_annual: number;
    inflation_annual: number;
    vol_annual: number;
    cycle_strength?: number;
    shock_prob_annual?: number;
    shock_size?: number;
  };

  /**
   * Piyasa baskı alanları (opsiyonel; DB'de yoksa da sistem çalışır)
   */
  demand_score?: number; // 0..1
  buy_pressure_count?: number; // toplam alım adedi
  buy_pressure_m2?: number; // toplam alınan m2
  sell_pressure_count?: number; // toplam satış adedi
  sell_pressure_m2?: number; // toplam satılan m2
};

export type BulkDiscountTier = {
  minM2: number;
  maxM2: number | null;
  discountRate: number; // 0.005 = %0.5
};

export const BUY_FEE_RATE = 0.005; // binde 5 = %0.5
export const SELL_FEE_RATE = 0.01; // %1

export const BULK_DISCOUNT_TIERS: BulkDiscountTier[] = [
  { minM2: 1, maxM2: 9, discountRate: 0 },
  { minM2: 10, maxM2: 49, discountRate: 0.002 },
  { minM2: 50, maxM2: 99, discountRate: 0.005 },
  { minM2: 100, maxM2: 199, discountRate: 0.009 },
  { minM2: 200, maxM2: 499, discountRate: 0.014 },
  { minM2: 500, maxM2: null, discountRate: 0.02 },
];

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function clamp01(x: number) {
  return clamp(x, 0, 1);
}

function safeNum(x: unknown, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function hashToUnitFloat(seed: string): number {
  let h = 2166136261;

  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const u = h >>> 0;
  return u / 4294967296;
}

function signedUnit(seed: string) {
  return hashToUnitFloat(seed) * 2 - 1;
}

/**
 * Kademeli toplu alım indirimi
 */
export function getBulkDiscountRate(m2: number): number {
  const qty = Math.max(1, Math.floor(safeNum(m2, 1)));

  const tier =
    BULK_DISCOUNT_TIERS.find((t) => {
      const aboveMin = qty >= t.minM2;
      const belowMax = t.maxM2 == null ? true : qty <= t.maxM2;
      return aboveMin && belowMax;
    }) ?? BULK_DISCOUNT_TIERS[0];

  return tier.discountRate;
}

export function getDemandStepRateForBuy(m2: number): number {
  const qty = Math.max(1, safeNum(m2, 1));

  if (qty >= 200) return 0.004; // binde 4
  if (qty >= 50) return 0.003; // binde 3
  if (qty >= 10) return 0.002; // binde 2
  return 0.001; // binde 1
}

export function getSellPressureStepRate(m2: number): number {
  const qty = Math.max(1, safeNum(m2, 1));

  if (qty >= 200) return 0.003;
  if (qty >= 50) return 0.002;
  if (qty >= 10) return 0.0015;
  return 0.001;
}

/**
 * Parsel payı (alınan m² / toplam m²) — birim fiyat çarpanı.
 * - Pay yüzde 20'den az: küçük dilim primi +%35
 * - Yüzde 20–50: orta dilim −%15
 * - Yüzde 50 üstü: liste (tek sefer üst sınır seed tarafında toplamın ~%55’i ile uyumlu)
 */
export function getParcelSharePriceMultiplier(share: number): {
  multiplier: number;
  label: string;
} {
  const s = Math.max(0, Math.min(1, share));
  if (s < 0.2) {
    return { multiplier: 1.35, label: "Küçük pay (yüzde 20'den az): birim +%35" };
  }
  if (s <= 0.5) {
    return { multiplier: 0.85, label: "Orta pay (yüzde 20–50): birim −%15" };
  }
  return { multiplier: 1, label: "Büyük pay (yüzde 50 üstü): birim liste" };
}

/**
 * Kullanıcının alım anında göreceği indirimli birim fiyat
 * (önce parsel payı çarpanı, sonra toplu m² indirimi)
 */
export function getBuyUnitPriceTRY(property: SimProperty, marketPricePerM2: number, buyM2: number) {
  const qty = Math.max(0, safeNum(buyM2, 0));
  const totalArea = Math.max(1, safeNum(property.area_m2, 1));
  if (qty <= 0) {
    const list = safeNum(marketPricePerM2, 0);
    return {
      listPricePerM2: list,
      bulkDiscountRate: 0,
      discountedPricePerM2: list,
      shareOfParcel: 0,
      parcelShareMultiplier: 1,
      parcelShareLabel: "",
      adjustedListPricePerM2: list,
    };
  }
  const shareOfParcel = qty / totalArea;
  const { multiplier: parcelShareMultiplier, label: parcelShareLabel } =
    getParcelSharePriceMultiplier(shareOfParcel);

  const adjustedListPerM2 = marketPricePerM2 * parcelShareMultiplier;
  const bulkDiscountRate = getBulkDiscountRate(qty);
  const discountedPricePerM2 = adjustedListPerM2 * (1 - bulkDiscountRate);

  return {
    listPricePerM2: marketPricePerM2,
    bulkDiscountRate,
    discountedPricePerM2,
    shareOfParcel,
    parcelShareMultiplier,
    parcelShareLabel,
    adjustedListPricePerM2: adjustedListPerM2,
  };
}

/**
 * Alış ödeme özeti
 */
export function calculateBuyQuoteTRY(property: SimProperty, marketPricePerM2: number, buyM2: number) {
  const qty = Math.max(0, safeNum(buyM2, 0));
  const {
    listPricePerM2,
    bulkDiscountRate,
    discountedPricePerM2,
    shareOfParcel,
    parcelShareMultiplier,
    parcelShareLabel,
    adjustedListPricePerM2,
  } = getBuyUnitPriceTRY(property, marketPricePerM2, qty);

  if (qty <= 0) {
    return {
      listPricePerM2,
      bulkDiscountRate,
      discountedPricePerM2,
      grossAssetValue: 0,
      buyFeeRate: BUY_FEE_RATE,
      buyFee: 0,
      totalCost: 0,
      shareOfParcel,
      parcelShareMultiplier,
      parcelShareLabel,
      adjustedListPricePerM2,
    };
  }

  const grossAssetValue = discountedPricePerM2 * qty;
  const buyFee = grossAssetValue * BUY_FEE_RATE;
  const totalCost = grossAssetValue + buyFee;

  return {
    listPricePerM2,
    bulkDiscountRate,
    discountedPricePerM2,
    grossAssetValue,
    buyFeeRate: BUY_FEE_RATE,
    buyFee,
    totalCost,
    shareOfParcel,
    parcelShareMultiplier,
    parcelShareLabel,
    adjustedListPricePerM2,
  };
}

/**
 * Anlık alım: brüt = liste m² fiyatı × m²; komisyon sabit %0,5 (parsel / toplu indirim yok).
 * `totalParcelM2` verilirse sadece gösterim için parsel payı hesaplanır; fiyatı etkilemez.
 */
export function calculateSimpleBuyQuoteTRY(
  listPricePerM2: number,
  buyM2: number,
  opts?: { totalParcelM2?: number }
) {
  const qty = Math.max(0, safeNum(buyM2, 0));
  const list = safeNum(listPricePerM2, 0);
  const parcelTotal = opts?.totalParcelM2 != null ? Math.max(1, safeNum(opts.totalParcelM2, 1)) : null;
  if (qty <= 0 || !Number.isFinite(list) || list <= 0) {
    return {
      listPricePerM2: list,
      bulkDiscountRate: 0,
      discountedPricePerM2: list,
      grossAssetValue: 0,
      buyFeeRate: BUY_FEE_RATE,
      buyFee: 0,
      totalCost: 0,
      shareOfParcel: 0,
      parcelShareMultiplier: 1,
      parcelShareLabel: "",
      adjustedListPricePerM2: list,
    };
  }
  const grossAssetValue = list * qty;
  const buyFee = grossAssetValue * BUY_FEE_RATE;
  const totalCost = grossAssetValue + buyFee;
  const shareOfParcel = parcelTotal != null ? qty / parcelTotal : 0;
  return {
    listPricePerM2: list,
    bulkDiscountRate: 0,
    discountedPricePerM2: list,
    grossAssetValue,
    buyFeeRate: BUY_FEE_RATE,
    buyFee,
    totalCost,
    shareOfParcel,
    parcelShareMultiplier: 1,
    parcelShareLabel: "",
    adjustedListPricePerM2: list,
  };
}

/**
 * Satış ödeme özeti
 */
export function calculateSellQuoteTRY(marketPricePerM2: number, sellM2: number) {
  const qty = Math.max(0, safeNum(sellM2, 0));
  const px = safeNum(marketPricePerM2, 0);
  if (qty <= 0 || !Number.isFinite(px) || px <= 0) {
    return {
      marketPricePerM2: px,
      grossSaleValue: 0,
      sellFeeRate: SELL_FEE_RATE,
      sellFee: 0,
      netProceeds: 0,
    };
  }
  const grossSaleValue = px * qty;
  const sellFee = grossSaleValue * SELL_FEE_RATE;
  const netProceeds = grossSaleValue - sellFee;

  return {
    marketPricePerM2: px,
    grossSaleValue,
    sellFeeRate: SELL_FEE_RATE,
    sellFee,
    netProceeds,
  };
}

/**
 * Alım sonrası property fiyatını baskılamak için kullanılabilir.
 * Dashboard satın alma işleminden sonra burada dönen katsayıyı
 * property/market state'e uygulayacağız.
 */
export function getPostBuyPriceMultiplier(buyM2: number) {
  return 1 + getDemandStepRateForBuy(buyM2);
}

/**
 * Satış baskısı
 */
export function getPostSellPriceMultiplier(sellM2: number) {
  return Math.max(0.94, 1 - getSellPressureStepRate(sellM2));
}

/**
 * Günlük değerleme:
 * - binde 1 ile binde 8 arası hareket
 * - gelişim yüksekse artış eğilimi
 * - risk yüksekse oynaklık ve düşüş eğilimi
 * - talep yüksekse artış eğilimi
 */
export function getDailyValuationRate(property: SimProperty, simDayOffset: number, seedScope: string) {
  const day = Math.max(0, Math.floor(simDayOffset));

  const quality = clamp01(safeNum(property.quality_score, 0.5));
  const development = clamp01(safeNum(property.development_score, 0.5));
  const risk = clamp01(safeNum(property.risk_score, 0.5));
  const rentalYield = clamp01(safeNum(property.rental_yield_annual, 0.02));
  const demandScore = clamp01(safeNum(property.demand_score, 0));

  const buyPressureCount = Math.max(0, safeNum(property.buy_pressure_count, 0));
  const buyPressureM2 = Math.max(0, safeNum(property.buy_pressure_m2, 0));
  const sellPressureCount = Math.max(0, safeNum(property.sell_pressure_count, 0));
  const sellPressureM2 = Math.max(0, safeNum(property.sell_pressure_m2, 0));

  const demandFromFlow = clamp01(
    buyPressureCount * 0.015 +
      buyPressureM2 * 0.00008 -
      sellPressureCount * 0.012 -
      sellPressureM2 * 0.00006
  );

  const effectiveDemand = clamp01(demandScore * 0.55 + demandFromFlow * 0.45);

  const trendBias =
    development * 0.45 +
    quality * 0.16 +
    rentalYield * 0.08 +
    effectiveDemand * 0.24 -
    risk * 0.38;

  const normalizedBias = clamp(trendBias, -1, 1);

  const randomWave = signedUnit(`${seedScope}|${property.id}|day:${day}|wave`);
  const cycleWave =
    Math.sin((2 * Math.PI * day) / 30 + hashToUnitFloat(`${seedScope}|${property.id}|phase`) * Math.PI * 2) *
    0.35;

  const combinedWave = randomWave * (0.65 + risk * 0.35) + cycleWave;

  /**
   * Mutlak hareket bandı:
   * min binde 1 = 0.001
   * max binde 8 = 0.008
   */
  const minMove = 0.001;
  const maxMove = 0.008;

  /**
   * Pozitif bias varsa artış ihtimali,
   * negatif bias varsa düşüş ihtimali artar.
   */
  const directionalCore = normalizedBias * 0.65 + combinedWave * 0.35;

  const absMove =
    minMove +
    (maxMove - minMove) *
      clamp01(
        0.22 +
          risk * 0.28 +
          Math.abs(combinedWave) * 0.25 +
          effectiveDemand * 0.15 +
          development * 0.1
      );

  const rawRate = directionalCore >= 0 ? absMove : -absMove;

  return clamp(rawRate, -0.008, 0.008);
}

/**
 * Simülasyon fiyatı:
 * Bu fonksiyon fiyatı deterministik üretir.
 * İlk günlerde ani aşırı kâr yerine kontrollü hareket verir.
 */
export function simulatePropertyPriceTRY(
  property: SimProperty,
  simDayOffset: number,
  seedScope: string
) {
  const days = Math.max(0, Math.floor(simDayOffset));
  const area = property.area;

  const quality = clamp01(safeNum(property.quality_score, 0.5));
  const development = clamp01(safeNum(property.development_score, 0.5));
  const risk = clamp01(safeNum(property.risk_score, 0.5));

  const baseAreaM2Price = Math.max(1, safeNum(area.base_m2_price, 1000));

  /**
   * Property baz başlangıç m² fiyatı
   */
  const initialPricePerM2 =
    baseAreaM2Price *
    (0.88 + quality * 0.16 + development * 0.18 - risk * 0.10);

  let currentPricePerM2 = Math.max(1, initialPricePerM2);

  for (let day = 1; day <= days; day++) {
    const dailyRate = getDailyValuationRate(property, day, seedScope);
    currentPricePerM2 *= 1 + dailyRate;
    currentPricePerM2 = Math.max(1, currentPricePerM2);
  }

  /**
   * Demand / satış baskısı katsayısı
   */
  const buyPressureCount = Math.max(0, safeNum(property.buy_pressure_count, 0));
  const buyPressureM2 = Math.max(0, safeNum(property.buy_pressure_m2, 0));
  const sellPressureCount = Math.max(0, safeNum(property.sell_pressure_count, 0));
  const sellPressureM2 = Math.max(0, safeNum(property.sell_pressure_m2, 0));

  const demandMultiplier =
    1 +
    buyPressureCount * 0.0015 +
    buyPressureM2 * 0.000015 -
    sellPressureCount * 0.0012 -
    sellPressureM2 * 0.00001;

  currentPricePerM2 *= clamp(demandMultiplier, 0.85, 1.35);

  const totalPrice = currentPricePerM2 * Math.max(1, safeNum(property.area_m2, 1));

  return {
    price: Math.max(1, totalPrice),
    pricePerM2: Math.max(1, currentPricePerM2),
    initialPricePerM2: Math.max(1, initialPricePerM2),
  };
}