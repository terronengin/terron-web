ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS land_type text;

COMMENT ON COLUMN public.properties.land_type IS 'Arazi sınıfı (Arsa, Tarla, Ticari Arsa, …)';
