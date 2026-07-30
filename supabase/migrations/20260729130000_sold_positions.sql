-- Satış geçmişi: positions silinirken anlık görüntüsü buraya düşer (additive, positions'ın mevcut delete davranışı değişmez).
-- Portföy "Satılan" sekmesi ve "Diğer Kullanıcılar" en çok kâr edenler listesi bu tablodan beslenir.

CREATE TABLE IF NOT EXISTS sold_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  property_title text,
  city text,
  m2 numeric NOT NULL,
  total_paid numeric NOT NULL,
  sell_gross numeric NOT NULL,
  sell_fee numeric NOT NULL,
  sell_net numeric NOT NULL,
  profit_try numeric NOT NULL,
  profit_pct numeric NOT NULL,
  sold_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sold_positions_user_id ON sold_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_sold_positions_sold_at ON sold_positions(sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sold_positions_profit_pct ON sold_positions(profit_pct DESC);

COMMENT ON TABLE sold_positions IS 'positions satılırken tutulan anlık kar/zarar görüntüsü; positions satırı silinir, bu kalır.';

ALTER TABLE sold_positions ENABLE ROW LEVEL SECURITY;

-- Yalnızca servis rolü yazar (app/api/portfolio/sell) — istemciden doğrudan insert/update/delete yok.
CREATE POLICY "sold_positions_select_own"
  ON sold_positions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
