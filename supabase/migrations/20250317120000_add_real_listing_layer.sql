-- Terron: Demo / gerçek ilan ayrımı + admin onay katmanı
-- Mevcut satırlar: is_real=false, listing_status mevcut status ile hizalanır.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_real boolean NOT NULL DEFAULT false;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS listing_status text NOT NULL DEFAULT 'approved';

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_name text;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_phone text;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_email text;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS submitted_by text;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS approval_note text;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS deed_image_url text;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS listing_description text;

-- Geriye dönük: status -> listing_status eşlemesi (active=approved)
UPDATE properties
SET listing_status = CASE COALESCE(status::text, '')
  WHEN 'active' THEN 'approved'
  WHEN 'pending' THEN 'pending'
  WHEN 'rejected' THEN 'rejected'
  ELSE 'approved'
END;

COMMENT ON COLUMN properties.is_real IS 'true: kullanıcı/operasyonel gerçek ilan; false: demo veya simülasyon verisi';
COMMENT ON COLUMN properties.listing_status IS 'pending | approved | rejected — gerçek ilan yayın akışı';

-- Opsiyonel: RLS kullanıyorsanız Supabase SQL Editor ile uygun INSERT/SELECT politikalarını ekleyin.
