ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS zoning_band text;

UPDATE public.properties
SET zoning_band = CASE
  WHEN zoning_status IS NULL OR trim(zoning_status::text) = '' THEN 'bilinmiyor'
  WHEN lower(trim(zoning_status::text)) = 'imarli' THEN 'imarli'
  WHEN lower(trim(zoning_status::text)) = 'imarsiz' THEN 'imarsiz'
  WHEN zoning_status::text ILIKE '%İmarlı%' OR zoning_status::text ILIKE '%Konut%' OR zoning_status::text ILIKE '%Villa%'
    OR zoning_status::text ILIKE '%Ticaret%' OR zoning_status::text ILIKE '%Sanayi%' THEN 'imarli'
  WHEN zoning_status::text ILIKE '%Tarla%' OR zoning_status::text ILIKE '%Bahçe%' OR zoning_status::text ILIKE '%İncelenmeli%' THEN 'imarsiz'
  WHEN lower(zoning_status::text) = 'bilinmiyor' THEN 'bilinmiyor'
  ELSE 'mixed'
END
WHERE zoning_band IS NULL;

COMMENT ON COLUMN public.properties.zoning_band IS 'imarli | imarsiz | bilinmiyor | mixed — keşif filtresi';
