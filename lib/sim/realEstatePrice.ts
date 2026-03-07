export type SimProperty = {
  id: string;
  area_m2: number;
  quality_score: number;
  development_score: number;
  risk_score: number;
  rental_yield_annual: number;
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
};

function hashToUnitFloat(seed: string): number {
  let h = 2166136261;

  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const u = h >>> 0;
  return u / 4294967296;
}

function normalish(seed: string): number {
  const u1 = Math.max(hashToUnitFloat(`${seed}|u1`), 1e-9);
  const u2 = Math.max(hashToUnitFloat(`${seed}|u2`), 1e-9);

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function simulatePropertyPriceTRY(
  property: SimProperty,
  simDayOffset: number,
  seedScope: string
) {
  const days = Math.max(0, Math.floor(simDayOffset));
  const area = property.area;

  const muAnnual =
    Number(area.expected_real_return_annual ?? 0) +
    Number(property.development_score ?? 0) * 0.03 +
    Number(property.rental_yield_annual ?? 0) * 0.4 +
    Number(area.inflation_annual ?? 0);

  const muDaily = Math.log(1 + muAnnual) / 365;

  const sigmaAnnual =
    Number(area.vol_annual ?? 0) * (0.75 + 0.7 * Number(property.risk_score ?? 0));

  const sigmaDaily = sigmaAnnual / Math.sqrt(365);

  const P0 =
    Number(property.area_m2 ?? 0) *
    Number(area.base_m2_price ?? 0) *
    (0.85 + 0.3 * Number(property.quality_score ?? 0));

  let logP = Math.log(Math.max(P0, 1));

  for (let t = 1; t <= days; t++) {
    const baseSeed = `${seedScope}|${property.id}|day:${t}`;
    const z = normalish(baseSeed);
    const eps = sigmaDaily * z;
    logP += muDaily + eps;
  }

  const price = Math.exp(logP);
  const pricePerM2 = price / Math.max(Number(property.area_m2 ?? 1), 1);

  return { price, pricePerM2 };
}