-- Gerçek ilan satış talepleri (lead pipeline)

CREATE TABLE IF NOT EXISTS property_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  property_title text,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  message text,
  requested_m2 numeric,
  budget numeric,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  contact_preference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_inquiries_property_id ON property_inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_status ON property_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_property_inquiries_created_at ON property_inquiries(created_at DESC);

COMMENT ON TABLE property_inquiries IS 'Gerçek ilanlar için müşteri talepleri; demo yatırım akışından ayrıdır.';
COMMENT ON COLUMN property_inquiries.status IS 'new | contacted | negotiating | closed_won | closed_lost';

ALTER TABLE property_inquiries
  ADD CONSTRAINT property_inquiries_status_check
  CHECK (status IN ('new', 'contacted', 'negotiating', 'closed_won', 'closed_lost'));

-- RLS: service_role API route ile bypass eder; anon insert dashboard 503 fallback için.
ALTER TABLE property_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "property_inquiries_insert_anon"
  ON property_inquiries FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "property_inquiries_all_authenticated"
  ON property_inquiries FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
