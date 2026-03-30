-- Terron: platform komisyon defteri (alış / satış ayrı satırlar)

CREATE TABLE IF NOT EXISTS platform_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid,
  position_id uuid,
  type text NOT NULL CHECK (type IN ('buy_fee', 'sell_fee')),
  gross_amount numeric NOT NULL DEFAULT 0,
  fee_rate numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_revenue_user ON platform_revenue (user_id);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_created ON platform_revenue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_type ON platform_revenue (type);

COMMENT ON TABLE platform_revenue IS 'Alış/satış komisyon kayıtları; gross_amount = işlem hacmi (alışta ödenen toplam, satışta brüt satış)';
COMMENT ON COLUMN platform_revenue.gross_amount IS 'Alış: total_paid; Satış: liste × m² (brüt)';
COMMENT ON COLUMN platform_revenue.fee_amount IS 'Platform komisyonu (Terron geliri)';
