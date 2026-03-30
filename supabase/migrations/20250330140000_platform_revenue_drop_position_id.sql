-- Eski şemada position_id varsa kaldır (Supabase şema cache ile uyum)

ALTER TABLE platform_revenue DROP COLUMN IF EXISTS position_id;
