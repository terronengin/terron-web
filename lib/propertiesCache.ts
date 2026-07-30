import { supabase } from "./supabaseClient";
import type { PropertyRow } from "./terron/propertyRow";

/**
 * Anasayfa/Market gibi sekmeler arasında geçiş yaparken aynı ~6800 kayıtlık
 * ulusal veri setini her seferinde yeniden çekmemek için modül seviyesinde bellek içi önbellek.
 * Sekmeler arası geçiş bu sayede anında olur; ilk yükleme ve 5 dakikadan sonraki yenilemeler
 * yine ağdan çeker.
 */
let cache: { items: PropertyRow[]; ts: number } | null = null;
let inFlight: Promise<PropertyRow[]> | null = null;
const TTL_MS = 5 * 60 * 1000;

async function fetchFresh(): Promise<PropertyRow[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return [];
  const res = await fetch("/api/properties/dashboard", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { ok?: boolean; items?: PropertyRow[] };
  if (res.ok && json.ok && Array.isArray(json.items)) return json.items;
  return [];
}

export async function getCachedProperties(forceRefresh = false): Promise<PropertyRow[]> {
  if (!forceRefresh && cache && Date.now() - cache.ts < TTL_MS) return cache.items;
  if (!forceRefresh && inFlight) return inFlight;

  inFlight = fetchFresh()
    .then((items) => {
      if (items.length > 0) cache = { items, ts: Date.now() };
      return items.length > 0 ? items : (cache?.items ?? []);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function invalidatePropertiesCache() {
  cache = null;
}
