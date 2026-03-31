import { parseTurkeyLatLng } from "@/lib/map/normalizeCoordinates";
import { syntheticDistrictIndexFromLabel } from "@/lib/regions/trRegions";

function hashString32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Paneldeki şehir / sentetik ilçe / mahalle ile uyumlu: aynı adres metni → aynı bölgeye yakın nokta.
 * İlçe indeksine göre sektör (8 dilim), mahalle metnine göre ince açı; "Sahil" daha sıkı yarıçap (kıyıya savrulmayı azaltır).
 */
export function seedCoordsFromSyntheticAddress(
  baseLat: number,
  baseLng: number,
  city: string,
  district: string,
  neighborhood: string,
  idx: number,
  rng: () => number
): { lat: number; lng: number } {
  const dIdx = syntheticDistrictIndexFromLabel(district, city);
  const nh = neighborhood.trim();
  const nhPart = hashString32(`${city}|${district}|${nh}`);
  const nhAngle = ((nhPart % 6283) / 6283) * Math.PI * 2;

  const sectorAngle = (dIdx / 8) * Math.PI * 2 + nhAngle * 0.12;
  let r = 0.0038 + (idx % 13) * 0.00018 + (nhPart % 7) * 0.00012;
  if (dIdx === 6) r *= 0.58;

  let lat = baseLat + Math.cos(sectorAngle) * r * 0.92;
  let lng = baseLng + Math.sin(sectorAngle) * r * 0.92;
  lat += (rng() - 0.5) * 0.00055;
  lng += (rng() - 0.5) * 0.00055;

  const parsed = parseTurkeyLatLng(lat, lng);
  if (parsed) {
    lat = parsed.lat;
    lng = parsed.lng;
  }
  return { lat, lng };
}
