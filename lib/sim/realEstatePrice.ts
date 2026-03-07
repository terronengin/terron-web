import { hashToUnitFloat, normalish } from "./hash";

export function simulatePropertyPriceTRY(
  property: any,
  simDayOffset: number,
  seedScope: string
) {
  const days = Math.max(0, Math.floor(simDayOffset));
  const area = property.area;

  const muAnnual =
    area.expected_real_return_annual +
    property.development_score * 0.03 +
    property.rental_yield_annual * 0.4 +
    area.inflation_annual;

  const muDaily = Math.log(1 + muAnnual) / 365;

  const sigmaAnnual =
    area.vol_annual * (0.75 + 0.7 * property.risk_score);

  const sigmaDaily = sigmaAnnual / Math.sqrt(365);

  const P0 =
    property.area_m2 *
    area.base_m2_price *
    (0.85 + 0.3 * property.quality_score);

  let logP = Math.log(P0);

  for (let t = 1; t <= days; t++) {
    const baseSeed = `${seedScope}|${property.id}|day:${t}`;

    const z = normalish(baseSeed);
    const eps = sigmaDaily * z;

    logP += muDaily + eps;
  }

  const price = Math.exp(logP);
  const pricePerM2 = price / property.area_m2;

  return { price, pricePerM2 };
}