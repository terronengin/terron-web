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
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
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

  const quality = clamp01(Number(property.quality_score ?? 0));
  const development = clamp01(Number(property.development_score ?? 0));
  const risk = clamp01(Number(property.risk_score ?? 0));
  const rentalYield = clamp01(Number(property.rental_yield_annual ?? 0));

  const expectedReal = Number(area.expected_real_return_annual ?? 0.04);
  const inflation = Number(area.inflation_annual ?? 0.0);
  const baseVol = Math.max(0.01, Number(area.vol_annual ?? 0.12));
  const cycleStrength = clamp01(Number(area.cycle_strength ?? 0.5));
  const shockProbAnnual = clamp01(Number(area.shock_prob_annual ?? 0.05));
  const shockSize = Number(area.shock_size ?? -0.08);

  const muAnnual =
    expectedReal +
    inflation +
    development * 0.10 +
    quality * 0.04 +
    rentalYield * 0.25 -
    risk * 0.06;

  const muDaily = Math.log(1 + Math.max(-0.95, muAnnual)) / 365;

  const sigmaAnnual =
    baseVol * (0.75 + risk * 0.9 - development * 0.15 + (1 - quality) * 0.1);

  const sigmaDaily = sigmaAnnual / Math.sqrt(365);

  const baseM2 =
    Number(area.base_m2_price ?? 0) *
    (0.82 + quality * 0.22 + development * 0.18 - risk * 0.12);

  const P0 = Math.max(1, Number(property.area_m2 ?? 1) * Math.max(1, baseM2));

  let logP = Math.log(P0);

  for (let t = 1; t <= days; t++) {
    const seedBase = `${seedScope}|${property.id}|day:${t}`;

    const z = normalish(`${seedBase}|noise`);
    const eps = sigmaDaily * z;

    const cycle =
      Math.sin((2 * Math.PI * t) / 180 + hashToUnitFloat(`${seedBase}|phase`) * Math.PI * 2) *
      (cycleStrength * 0.0018);

    const dailyShockChance = shockProbAnnual / 365;
    const shockRoll = hashToUnitFloat(`${seedBase}|shock-roll`);
    const shock =
      shockRoll < dailyShockChance
        ? Math.log(Math.max(0.55, 1 + shockSize * (0.7 + hashToUnitFloat(`${seedBase}|shock-mag`) * 0.6)))
        : 0;

    logP += muDaily + eps + cycle + shock;
  }

  const price = Math.max(1, Math.exp(logP));
  const pricePerM2 = price / Math.max(Number(property.area_m2 ?? 1), 1);

  return { price, pricePerM2 };
}