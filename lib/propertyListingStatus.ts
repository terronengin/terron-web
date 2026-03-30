/**
 * `properties.listing_status` — gerçek DB check constraint ile uyumlu değerler.
 * Bazı ortamlarda yalnızca pending | approved | rejected vardır ("active" yok).
 */
export const LISTING_STATUS_DB_VALUES = ["pending", "approved", "rejected"] as const;

export type ListingStatusDb = (typeof LISTING_STATUS_DB_VALUES)[number];

/** Harita / keşifte gösterilecek yayınlanmış ilan */
export const LISTING_STATUS_PUBLISHED: ListingStatusDb = "approved";

export function isAllowedListingStatus(value: unknown): value is ListingStatusDb {
  return (
    typeof value === "string" &&
    (LISTING_STATUS_DB_VALUES as readonly string[]).includes(value)
  );
}
