/**
 * İlan görünürlüğü — properties.listing_status: pending | approved | rejected (DB); keşifte yayın = approved
 */

export type ListingStatus = "pending" | "approved" | "rejected";

export function isRealListing(p: { is_real?: boolean | null } | null | undefined): boolean {
  return p?.is_real === true;
}

export function isRealProperty(p: { is_real?: boolean | null } | null | undefined): boolean {
  return isRealListing(p);
}

export function isListingApproved(p: { listing_status?: string | null } | null | undefined): boolean {
  const s = String(p?.listing_status ?? "").toLowerCase();
  return s === "approved";
}

/** Kullanıcı yüklemesi (gerçek ilan) */
export function isUserUploaded(p: { is_real?: boolean | null } | null | undefined): boolean {
  return p?.is_real === true;
}

/** Harita / keşif: yayında (listing_status = approved) */
export function isVisibleOnExplorer(p: {
  listing_status?: string | null;
} | null | undefined): boolean {
  if (!p) return false;
  const s = String(p.listing_status ?? "").toLowerCase();
  return s === "approved";
}

/** Gerçek kullanıcı ilanı + onaylı (talep / rezervasyon için) */
export function isApprovedUserListing(p: {
  listing_status?: string | null;
  is_real?: boolean | null;
} | null | undefined): boolean {
  if (!p) return false;
  if (!isListingApproved(p)) return false;
  return p.is_real === true;
}
