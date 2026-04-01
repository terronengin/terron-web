import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { demoCoordsOrFallback } from "@/lib/seed/gadmDistrictSampler";
import { allocateCountsByWeight } from "@/lib/seed/allocateCountsByWeight";
import {
  compositeCityWeight,
  districtSlotWeights,
  hashString32,
  logAllocatedSummary,
  logSampleWeights,
  neighborhoodSlotWeights,
} from "@/lib/seed/seedWeights";
import {
  DISTRICT_SUFFIXES,
  findCitySeedByName,
  listDistrictOptionsForCity,
  syntheticDistrict,
  syntheticNeighborhood,
  TR_CITY_SEEDS,
  type CitySeed,
  type TurkeyRegionName,
} from "@/lib/regions/trRegions";
import { LISTING_STATUS_PUBLISHED } from "@/lib/propertyListingStatus";
import { validateSeedRowForInsert } from "@/lib/seed/propertyInsertWhitelist";

/** Sentetik ilanlar: şehir/ilçe/mahalle ağırlıklı dağılım (`allocateCountsByWeight` + `seedWeights`). */
export const DEFAULT_SEED_TARGET = 15000;

/** Deterministik kök — aynı seed ile aynı coğrafi dağılım. */
const REGION_SEED_ROOT = 0x7e5eed01;

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function regionalBase(region: TurkeyRegionName): {
  price: number;
  liq: number;
  risk: number;
  dev: number;
  vol: number;
} {
  switch (region) {
    case "Marmara":
      return { price: 24000, liq: 72, risk: 38, dev: 76, vol: 0.12 };
    case "Ege":
      return { price: 18500, liq: 64, risk: 40, dev: 70, vol: 0.14 };
    case "Akdeniz":
      return { price: 17500, liq: 62, risk: 44, dev: 68, vol: 0.16 };
    case "İç Anadolu":
      return { price: 12000, liq: 58, risk: 36, dev: 62, vol: 0.11 };
    case "Karadeniz":
      return { price: 9800, liq: 52, risk: 42, dev: 55, vol: 0.13 };
    case "Doğu Anadolu":
      return { price: 7500, liq: 46, risk: 52, dev: 48, vol: 0.18 };
    case "Güneydoğu Anadolu":
      return { price: 9200, liq: 50, risk: 48, dev: 54, vol: 0.17 };
    default:
      return { price: 12000, liq: 55, risk: 42, dev: 60, vol: 0.14 };
  }
}

/**
 * Yalnızca DB’ye gidecek alanlar (source_type ve ekstra kolon yok).
 * Üretim mantığı: `lib/seed/seedTurkeyProperties.ts` → `insertSeedRows` → Supabase `properties`.
 */
function buildRow(
  citySeed: CitySeed,
  district: string,
  neighborhood: string,
  idx: number,
  rng: () => number
): Record<string, unknown> {
  const rb = regionalBase(citySeed.region);
  const { lat, lng } = demoCoordsOrFallback(citySeed, district, neighborhood, idx, rng);

  const zoning = rng() < 0.62 ? "imarli" : "imarsiz";
  const total = Math.round(400 + rng() * 9200);
  const liq01 = rb.liq / 100;
  const dev01 = rb.dev / 100;
  const soldRatio =
    0.04 + rng() * 0.2 * (0.45 + liq01 * 0.55) + rng() * 0.12 * (0.4 + dev01 * 0.6);
  let sold = Math.round(total * Math.min(0.44, soldRatio));
  sold = Math.min(sold, Math.max(0, total - 1));
  const available = Math.max(0, total - sold);
  const priceJ = 0.85 + rng() * 0.35;
  const price = Math.round(rb.price * priceJ * (zoning === "imarli" ? 1.12 : 0.55));

  const minBuy = 1;
  const maxByParcel = total * 0.55;
  let maxBuy =
    available <= 0
      ? 0
      : Math.max(minBuy, Math.round(Math.min(900, maxByParcel, available)));
  if (available > 0 && maxBuy < minBuy) maxBuy = minBuy;

  const ada = 100 + Math.floor(rng() * 900);
  const parsel = 1 + Math.floor(rng() * 2500);

  return {
    id: randomUUID(),
    title: `${citySeed.city} ${district} — ${parsel} parsel arsa`,
    city: citySeed.city,
    district,
    neighborhood,
    latitude: lat,
    longitude: lng,
    price_per_m2: price,
    total_area_m2: total,
    available_m2: available,
    sold_m2: sold,
    min_buy_m2: minBuy,
    max_buy_m2: maxBuy,
    listing_status: LISTING_STATUS_PUBLISHED,
    is_real: false,
  };
}

export type RegionSeedOptions = { city: string; district: string };

/**
 * Belirtilen adette sentetik ilan satırı üretir (DB insert formatı).
 * - `region` yok: Türkiye geneli dengeli dağılım.
 * - `region` dolu: yalnızca seçilen il + ilçe (mahalle çeşitliliği korunur).
 */
export function generateTurkeySeedRows(
  targetCount: number = DEFAULT_SEED_TARGET,
  region?: RegionSeedOptions
): Record<string, unknown>[] {
  if (region?.city?.trim() && region?.district?.trim()) {
    const citySeed = findCitySeedByName(region.city);
    if (!citySeed) {
      throw new Error(`Geçersiz il: ${region.city.trim()}`);
    }
    const dNorm = region.district.trim();
    const allowed = new Set(listDistrictOptionsForCity(citySeed.city));
    if (!allowed.has(dNorm)) {
      throw new Error(`İlçe bu il için tanımlı değil: ${dNorm}`);
    }
    const nhW = neighborhoodSlotWeights(citySeed, dNorm, REGION_SEED_ROOT);
    const minNh = targetCount >= 28 ? 0 : targetCount >= 12 ? 1 : 0;
    const nhCounts = allocateCountsByWeight(targetCount, nhW, { minPer: minNh });
    const nhLabels = Array.from({ length: 12 }, (_, ni) => syntheticNeighborhood(dNorm, ni));
    logAllocatedSummary(
      `allocated neighborhood counts ${citySeed.city}/${dNorm}`,
      nhCounts,
      nhLabels
    );

    const rows: Record<string, unknown>[] = [];
    let idx = 0;
    for (let ni = 0; ni < 12; ni++) {
      const nhCnt = nhCounts[ni] ?? 0;
      if (nhCnt === 0) continue;
      const nh = syntheticNeighborhood(dNorm, ni);
      for (let k = 0; k < nhCnt; k++) {
        const rng2 = mulberry32(
          ((idx + 1) * 0x9e3779b9) ^ hashString32(`${citySeed.city}|${dNorm}|${ni}|${k}`)
        );
        rows.push(buildRow(citySeed, dNorm, nh, idx, rng2));
        idx++;
      }
    }
    if (rows.length !== targetCount) {
      console.warn("[seed] region seed row count mismatch", { targetCount, actual: rows.length });
    }
    return rows;
  }

  const cityWeights = TR_CITY_SEEDS.map((c, i) => compositeCityWeight(c, i, REGION_SEED_ROOT));
  logSampleWeights(TR_CITY_SEEDS, cityWeights, REGION_SEED_ROOT);

  const minCity = targetCount >= TR_CITY_SEEDS.length * 2 ? 2 : 0;
  const cityCounts = allocateCountsByWeight(targetCount, cityWeights, { minPer: minCity });
  logAllocatedSummary("allocated city counts", cityCounts, TR_CITY_SEEDS.map((c) => c.city));

  for (const sampleCity of ["Ankara", "İstanbul"] as const) {
    const ci = TR_CITY_SEEDS.findIndex((c) => c.city === sampleCity);
    if (ci < 0) continue;
    const cs = TR_CITY_SEEDS[ci]!;
    const ct = cityCounts[ci] ?? 0;
    if (ct === 0) continue;
    const dW = districtSlotWeights(cs, REGION_SEED_ROOT);
    const dCounts = allocateCountsByWeight(ct, dW, {
      minPer: ct >= 40 ? 0 : ct >= DISTRICT_SUFFIXES.length ? 1 : 0,
    });
    logAllocatedSummary(
      `allocated district counts ${sampleCity}`,
      dCounts,
      DISTRICT_SUFFIXES.map((s) => `${cs.city} ${s}`)
    );
  }

  const rows: Record<string, unknown>[] = [];
  let idx = 0;
  for (let ci = 0; ci < TR_CITY_SEEDS.length; ci++) {
    const citySeed = TR_CITY_SEEDS[ci]!;
    const cityTotal = cityCounts[ci] ?? 0;
    if (cityTotal === 0) continue;
    const dW = districtSlotWeights(citySeed, REGION_SEED_ROOT);
    const minD = cityTotal >= 40 ? 0 : cityTotal >= DISTRICT_SUFFIXES.length ? 1 : 0;
    const dCounts = allocateCountsByWeight(cityTotal, dW, { minPer: minD });
    for (let di = 0; di < DISTRICT_SUFFIXES.length; di++) {
      const dCnt = dCounts[di] ?? 0;
      if (dCnt === 0) continue;
      const district = syntheticDistrict(citySeed.city, di);
      const nhW = neighborhoodSlotWeights(citySeed, district, REGION_SEED_ROOT);
      const minNh = dCnt >= 28 ? 0 : dCnt >= 12 ? 1 : 0;
      const nhCounts = allocateCountsByWeight(dCnt, nhW, { minPer: minNh });
      for (let ni = 0; ni < 12; ni++) {
        const nhCnt = nhCounts[ni] ?? 0;
        if (nhCnt === 0) continue;
        const nh = syntheticNeighborhood(district, ni);
        for (let k = 0; k < nhCnt; k++) {
          const rng2 = mulberry32(
            ((idx + 1) * 0x9e3779b9) ^ hashString32(`${citySeed.city}|${di}|${ni}|${k}`)
          );
          rows.push(buildRow(citySeed, district, nh, idx, rng2));
          idx++;
        }
      }
    }
  }

  if (rows.length !== targetCount) {
    console.warn("[seed] national seed row count mismatch", { targetCount, actual: rows.length });
  }
  return rows;
}

export type SeedStats = {
  inserted: number;
  skippedReason?: string;
};

/** Sistem (sentetik) ilan sayısı — source_type yok; is_real = false */
export async function countSeededProperties(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("is_real", false);
  if (error) throw error;
  return count ?? 0;
}

/** Yeni seed satırlarını batch insert eder. */
export async function insertSeedRows(
  sb: SupabaseClient,
  rows: Record<string, unknown>[],
  batchSize = 500
): Promise<number> {
  const sanitized: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = validateSeedRowForInsert(rows[i]!, i);
    if (!v.ok) {
      throw new Error(`Satır doğrulanamadı [${v.issue.index}]: ${v.issue.reason}`);
    }
    sanitized.push(v.row);
  }

  console.log("[seed] insertSeedRows: generated count", sanitized.length);
  if (sanitized.length > 0) {
    console.log("[seed] first property (insert payload)", JSON.stringify(sanitized[0], null, 2));
  }

  let inserted = 0;
  for (let i = 0; i < sanitized.length; i += batchSize) {
    const batch = sanitized.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    console.log("[seed] insert batch starting", {
      batchIndex,
      batchSize: batch.length,
      totalRows: sanitized.length,
    });

    console.log("[seed] FINAL INSERT PAYLOAD (first row of batch)", JSON.stringify(batch[0] ?? null, null, 2));

    const { data, error } = await sb.from("properties").insert(batch).select("id");

    console.log("INSERT RESULT", data, error);

    if (error) {
      console.error("[seed] Supabase insert error", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      throw error;
    }

    console.log("[seed] Supabase insert response", {
      returnedRowCount: data?.length ?? 0,
      firstIds: Array.isArray(data) ? data.slice(0, 5).map((r: { id?: string }) => r.id) : [],
    });
    if (batchIndex === 0 && Array.isArray(data) && data.length > 0) {
      console.log(
        "[seed] first batch insert response (JSON sample, first 2 rows)",
        JSON.stringify({ data: data.slice(0, 2) }, null, 2)
      );
    }

    inserted += batch.length;
  }
  return inserted;
}
