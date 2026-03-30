/**
 * Tek standart: DB alanları latitude / longitude; Mapbox [longitude, latitude].
 * Yaygın hata: TR için lat/lng sütunları ters yazılmış — Türkiye sınırları ile sezgisel düzeltme.
 */

/** Türkiye yaklaşık sınırları (derece) */
const TR_LAT_MIN = 35.7;
const TR_LAT_MAX = 42.4;
const TR_LNG_MIN = 25.5;
const TR_LNG_MAX = 45.2;

export function looksLikeTurkeyLatLng(lat: number, lng: number): boolean {
  return lat >= TR_LAT_MIN && lat <= TR_LAT_MAX && lng >= TR_LNG_MIN && lng <= TR_LNG_MAX;
}

/**
 * lat/lng çiftini döndürür; TR için ters yazılmışsa düzeltir.
 */
export function normalizeLatLngPair(
  latIn: unknown,
  lngIn: unknown
): { latitude: number; longitude: number } | null {
  const a = Number(latIn);
  const b = Number(lngIn);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (looksLikeTurkeyLatLng(a, b)) return { latitude: a, longitude: b };
  if (looksLikeTurkeyLatLng(b, a)) return { latitude: b, longitude: a };
  return { latitude: a, longitude: b };
}

export function isValidLatLng(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 1e-7 && Math.abs(lng) < 1e-7) return false;
  return true;
}

/** Harita başlangıç / home: Türkiye merkezi [lng, lat] */
export const TURKEY_CENTER_LNG = 35.2433;
export const TURKEY_CENTER_LAT = 38.9637;

/** Marmara bölge merkezi [lng, lat] — referans */
export const MARMARA_CENTER_LNG = 28.5;
export const MARMARA_CENTER_LAT = 40.7;
