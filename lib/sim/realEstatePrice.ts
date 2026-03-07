function getRealEstateSim(p: Property) {
  if (!p.area || !p.total_area_m2 || p.total_area_m2 <= 0) return null;

  const seedScope = userId ?? "global";

  const risk01 = clamp01((p.risk_score ?? 50) / 100);
  const dev01 = clamp01((p.development_score ?? 50) / 100);

  const quality01 =
    p.quality_score != null ? clamp01(p.quality_score) : clamp01(0.55 + dev01 * 0.2 - risk01 * 0.1);

  const rentalYield = p.rental_yield_annual != null ? clamp01(p.rental_yield_annual) : 0.05;

  const propertyForSim = {
    id: p.id,
    area_m2: Number(p.total_area_m2),
    quality_score: quality01,
    development_score: dev01,
    risk_score: risk01,
    rental_yield_annual: rentalYield,
    area: {
      id: p.area.id,
      base_m2_price: Number(p.area.base_m2_price),
      expected_real_return_annual: Number(p.area.expected_real_return_annual ?? 0.03),
      inflation_annual: Number(p.area.inflation_annual ?? 0.0),
      vol_annual: Number(p.area.vol_annual ?? 0.12),
      cycle_strength: Number(p.area.cycle_strength ?? 0.6),
      shock_prob_annual: Number(p.area.shock_prob_annual ?? 0.06),
      shock_size: Number(p.area.shock_size ?? -0.08),
    },
  };

  const out = simulatePropertyPriceTRY(propertyForSim as any, simDayOffset, seedScope);

  const totalShares = Number(p.total_shares ?? 100000);
  const sharePrice = out.price / Math.max(1, totalShares);

  return { ...out, sharePrice, totalShares };
}