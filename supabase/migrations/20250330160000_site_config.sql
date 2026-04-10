-- Tek satırlık site ayarları (ör. giriş ekranında gösterilen kullanıcı sayısı)

CREATE TABLE IF NOT EXISTS public.site_config (
  key text PRIMARY KEY,
  value_int bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.site_config IS 'Anahtar-değer site ayarları; istemci doğrudan erişmez, yalnızca sunucu API (service role).';

INSERT INTO public.site_config (key, value_int)
VALUES ('display_user_count', 28377)
ON CONFLICT (key) DO NOTHING;
