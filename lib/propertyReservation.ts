/**
 * Gerçek ilan rezervasyon & satış pipeline.
 */

export type ReservationStatus =
  | "new"
  | "reserved"
  | "offer_sent"
  | "negotiating"
  | "deposit_pending"
  | "deposit_received"
  | "closed_won"
  | "closed_lost";

export type DepositStatus = "none" | "pending" | "received";

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  new: "Yeni",
  reserved: "Rezerve",
  offer_sent: "Teklif gönderildi",
  negotiating: "Pazarlık",
  deposit_pending: "Kapora bekleniyor",
  deposit_received: "Kapora alındı",
  closed_won: "Satış kazanıldı",
  closed_lost: "Satış kaybedildi",
};

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  none: "Yok",
  pending: "Bekliyor",
  received: "Alındı",
};

export type PropertyReservationRow = {
  id: string;
  property_id: string;
  inquiry_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  requested_m2: number | null;
  offered_price_per_m2: number | null;
  total_offer_amount: number | null;
  reserved_m2: number | null;
  reservation_expires_at: string | null;
  status: ReservationStatus | string;
  deposit_amount: number | null;
  deposit_status: DepositStatus | string | null;
  admin_note: string | null;
  customer_note: string | null;
  created_at: string;
  updated_at: string;
};

export function isReservationStatus(s: string): s is ReservationStatus {
  return (
    [
      "new",
      "reserved",
      "offer_sent",
      "negotiating",
      "deposit_pending",
      "deposit_received",
      "closed_won",
      "closed_lost",
    ] as const
  ).includes(s as ReservationStatus);
}
