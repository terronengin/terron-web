/**
 * Gerçek ilan talep (lead) satış hattı.
 */

export type InquiryStatus = "new" | "contacted" | "negotiating" | "closed_won" | "closed_lost";

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "Yeni",
  contacted: "İletişime geçildi",
  negotiating: "Pazarlık",
  closed_won: "Kazanıldı",
  closed_lost: "Kaybedildi",
};

export type PropertyInquiryRow = {
  id: string;
  property_id: string;
  property_title: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  message: string | null;
  requested_m2: number | null;
  budget: number | null;
  status: InquiryStatus | string;
  admin_note: string | null;
  contact_preference: string | null;
  created_at: string;
};

export function isInquiryStatus(s: string): s is InquiryStatus {
  return ["new", "contacted", "negotiating", "closed_won", "closed_lost"].includes(s);
}
