-- Terron: seeded / kullanıcı yükleme ayrımı + zengin ilan alanları
-- Mevcut satırlar korunur; backfill ile doldurulur.

-- ---------------------------------------------------------------------------
-- Yeni sütunlar
-- ---------------------------------------------------------------------------
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 0.7;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS liquidity_score integer DEFAULT 50;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS growth_story text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS risk_factors text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parcel_code text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_display_name text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS location_quality_score integer DEFAULT 50;

-- ---------------------------------------------------------------------------
-- Backfill: source_type (gerçek kullanıcı = user_uploaded, diğer = seeded)
-- ---------------------------------------------------------------------------
UPDATE properties
SET source_type = CASE
  WHEN COALESCE(is_real, false) = true THEN 'user_uploaded'
  ELSE 'seeded'
END
WHERE source_type IS NULL;

UPDATE properties SET source_type = 'seeded' WHERE source_type IS NULL;

ALTER TABLE properties ALTER COLUMN source_type SET DEFAULT 'seeded';

-- ---------------------------------------------------------------------------
-- listing_status: 'active' eklendi (seeded yayında)
-- ---------------------------------------------------------------------------
-- Eski constraint varsa kaldır
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_listing_status_check;

ALTER TABLE properties
  ADD CONSTRAINT properties_listing_status_check
  CHECK (listing_status IN ('pending', 'approved', 'rejected', 'active'));

-- ---------------------------------------------------------------------------
-- source_type constraint
-- ---------------------------------------------------------------------------
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_source_type_check;

ALTER TABLE properties
  ADD CONSTRAINT properties_source_type_check
  CHECK (source_type IN ('seeded', 'user_uploaded'));

COMMENT ON COLUMN properties.source_type IS 'seeded | user_uploaded';
COMMENT ON COLUMN properties.is_visible IS 'Harita / keşif görünürlüğü';
COMMENT ON COLUMN properties.listing_status IS 'pending | approved | rejected | active';
