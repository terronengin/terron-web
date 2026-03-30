/** Türkiye yaklaşık sınırları — harita / seed güvenliği */

/** MapView / harita ile aynı — dar aralık çok fazla geçerli kaydı düşürüyordu */
export const TR_LAT_MIN = 35;
export const TR_LAT_MAX = 43;
export const TR_LNG_MIN = 25;
export const TR_LNG_MAX = 45;

export type ParsedCoord = { lat: number; lng: number };

/** Enlem/boylam çiftini doğrular; ters yazılmışsa düzeltir. */
export function parseTurkeyLatLng(latIn: unknown, lngIn: unknown): ParsedCoord | null {
  if (latIn == null || lngIn == null) return null;
  let lat = Number(latIn);
  let lng = Number(lngIn);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const ok =
    lat >= TR_LAT_MIN && lat <= TR_LAT_MAX && lng >= TR_LNG_MIN && lng <= TR_LNG_MAX;
  const swappedLooks =
    lng >= TR_LAT_MIN &&
    lng <= TR_LAT_MAX &&
    lat >= TR_LNG_MIN &&
    lat <= TR_LNG_MAX &&
    !ok;
  if (swappedLooks) {
    const t = lat;
    lat = lng;
    lng = t;
  }

  if (lat < TR_LAT_MIN || lat > TR_LAT_MAX || lng < TR_LNG_MIN || lng > TR_LNG_MAX) return null;
  return { lat, lng };
}

export function applyCoordJitter(lat: number, lng: number, index: number, spread = 0.00025): ParsedCoord {
  const a = index * 0.913;
  return {
    lat: lat + Math.sin(a) * spread * (index % 7),
    lng: lng + Math.cos(a) * spread * (index % 5),
  };
}
