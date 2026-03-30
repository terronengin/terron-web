import { parseTurkeyLatLng } from "@/lib/map/normalizeCoordinates";

/**
 * Harita için TR sınırları içinde lat/lng; ters yazılmışsa düzeltir.
 * Dashboard → MapView öncesi tek kaynak.
 */
export function normalizeExplorerLatLng(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  const p = parseTurkeyLatLng(lat, lng);
  if (!p) return null;
  return { latitude: p.lat, longitude: p.lng };
}
