-- Gerçek ilan rezervasyon & satış pipeline (ödeme entegrasyonu öncesi alanlar)

CREATE TABLE IF NOT EXISTS property_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  inquiry_id uuid REFERENCES property_inquiries(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  requested_m2 numeric,
  offered_price_per_m2 numeric,
  total_offer_amount numeric,
  reserved_m2 numeric,
  reservation_expires_at timestamptz,
  status text NOT NULL DEFAULT 'new',
  deposit_amount numeric,
  deposit_status text,
  admin_note text,
  customer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_reservations_property_id ON property_reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_property_reservations_status ON property_reservations(status);
CREATE INDEX IF NOT EXISTS idx_property_reservations_created_at ON property_reservations(created_at DESC);

COMMENT ON TABLE property_reservations IS 'Ciddi alıcı rezervasyon ve satış pipeline; demo cüzdan akışından ayrıdır.';
COMMENT ON COLUMN property_reservations.status IS 'new | reserved | offer_sent | negotiating | deposit_pending | deposit_received | closed_won | closed_lost';
COMMENT ON COLUMN property_reservations.deposit_status IS 'none | pending | received';

ALTER TABLE property_reservations
  ADD CONSTRAINT property_reservations_status_check
  CHECK (
    status IN (
      'new',
      'reserved',
      'offer_sent',
      'negotiating',
      'deposit_pending',
      'deposit_received',
      'closed_won',
      'closed_lost'
    )
  );

ALTER TABLE property_reservations
  ADD CONSTRAINT property_reservations_deposit_status_check
  CHECK (deposit_status IS NULL OR deposit_status IN ('none', 'pending', 'received'));

CREATE OR REPLACE FUNCTION public.set_property_reservations_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_reservations_updated_at ON property_reservations;
CREATE TRIGGER trg_property_reservations_updated_at
  BEFORE UPDATE ON property_reservations
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_property_reservations_updated_at();

ALTER TABLE property_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_reservations_insert_anon"
  ON property_reservations FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "property_reservations_all_authenticated"
  ON property_reservations FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
