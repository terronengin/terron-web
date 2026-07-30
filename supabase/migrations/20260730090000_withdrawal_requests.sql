-- Para çekme talepleri: gerçek banka entegrasyonu yok, kullanıcı IBAN/hesap bilgisi girer,
-- talep "pending" olarak kaydedilir ve bakiyeden düşülür; admin panelinden manuel işlenir.

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  bank_name text NOT NULL,
  account_holder_name text NOT NULL,
  iban text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON withdrawal_requests(created_at DESC);

COMMENT ON TABLE withdrawal_requests IS 'Kullanıcı para çekme talepleri; gerçek banka transferi yapılmaz, admin tarafından manuel işlenir.';

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Yalnızca servis rolü yazar (app/api/wallet/withdraw) — istemciden doğrudan insert/update/delete yok.
CREATE POLICY "withdrawal_requests_select_own"
  ON withdrawal_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
