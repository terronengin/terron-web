import { parseTurkeyLatLng } from "@/lib/map/normalizeCoordinates";

/** Altın açı ile disk üzerinde yayılma — tekrarlayan index çarpanı yok */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Sentetik ilan koordinatı: şehir merkezine yakın, maksimum yarıçap içinde (denize savrulmayı azaltır).
 * Eski applyCoordJitter + büyük spread + (index%7) ile km'lerce sapma oluşuyordu.
 */
export function seedCoordsNearCityCenter(
  baseLat: number,
  baseLng: number,
  idx: number,
  rng: () => number,
  opts?: { maxRadiusDeg?: number }
): { lat: number; lng: number } {
  const maxR = opts?.maxRadiusDeg ?? 0.014;
  const t = Math.sqrt((idx % 997) / 997 + rng() * 0.001);
  const r = maxR * t;
  const th = idx * GOLDEN_ANGLE + rng() * 0.4;
  let lat = baseLat + r * Math.cos(th);
  let lng = baseLng + r * Math.sin(th);
  const parsed = parseTurkeyLatLng(lat, lng);
  if (parsed) {
    lat = parsed.lat;
    lng = parsed.lng;
  }
  return { lat, lng };
}
