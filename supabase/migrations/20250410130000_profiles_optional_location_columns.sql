-- Kayıt formu veya uygulama `profiles` üzerinde şehir/ilçe tutacaksa bu sütunlar gerekir.
-- Tablonuzda yoksa Supabase SQL Editor’da çalıştırın (veya `supabase db push`).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS district text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;
