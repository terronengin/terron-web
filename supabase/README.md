# Supabase migrations

1. Supabase Dashboard → SQL Editor’da `migrations/20250317120000_add_real_listing_layer.sql` dosyasını çalıştırın.
2. Ardından uygulama `listing_status` ve `is_real` alanlarını kullanır; migration uygulanmadan sorgular hata verebilir.

İlan gönderimi için isteğe bağlı: `SUPABASE_SERVICE_ROLE_KEY` ortam değişkenini sunucuya ekleyin (`app/api/submit-property` service role ile insert eder). Tanımlı değilse form, istemci üzerinden insert dener (RLS politikalarınıza bağlıdır).
