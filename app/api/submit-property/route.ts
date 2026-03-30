import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  title: string;
  country: string;
  city: string;
  district: string;
  neighborhood: string;
  /** Açık adres — geocoding için zorunlu (manuel koordinat yoksa) */
  address_line: string;
  listing_description: string;
  total_area_m2: number;
  available_m2: number;
  min_buy_m2: number;
  max_buy_m2: number;
  price_per_m2: number;
  zoning_status: string;
  ada_no?: string;
  parcel_no?: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  deed_image_url?: string;
  /** İleri seviye: doğrudan koordinat (manuel) */
  latitude?: number;
  longitude?: number;
  manual_coordinates?: boolean;
  submitted_by?: string;
};

const GEO_FAIL =
  "Adres konumu doğrulanamadı. Lütfen adresi daha açık girin.";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function geocodeAddress(parts: {
  address_line: string;
  neighborhood?: string | null;
  district: string;
  city: string;
  country: string;
}): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.MAPBOX_SERVER_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.error("[submit-property] Mapbox token missing for geocoding");
    return null;
  }
  const line = [
    parts.address_line.trim(),
    parts.neighborhood?.trim(),
    parts.district.trim(),
    parts.city.trim(),
    parts.country.trim() || "Türkiye",
  ]
    .filter((x) => !!x && String(x).trim().length > 0)
    .join(", ");

  if (line.length < 8) return null;

  const q = encodeURIComponent(line);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${token}&limit=1&country=TR`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: { center?: [number, number] }[] };
  const c = data?.features?.[0]?.center;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
  return { lat, lng };
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const b = raw as Body;

    if (!b.title?.trim()) return bad("Başlık gerekli");
    if (!b.city?.trim()) return bad("Şehir gerekli");
    if (!b.district?.trim()) return bad("İlçe gerekli");
    if (!Number.isFinite(b.total_area_m2) || b.total_area_m2 <= 0) return bad("Toplam m² geçersiz");
    if (!Number.isFinite(b.available_m2) || b.available_m2 < 0) return bad("Satılabilir m² geçersiz");
    if (b.available_m2 > b.total_area_m2) return bad("Satılabilir m² toplamı aşamaz");
    if (!b.owner_name?.trim() || !b.owner_phone?.trim() || !b.owner_email?.trim()) return bad("İletişim bilgileri eksik");

    const manual = b.manual_coordinates === true;
    let lat: number;
    let lng: number;

    if (manual) {
      if (!Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) {
        return bad("Manuel koordinatlar geçersiz.");
      }
      lat = Number(b.latitude);
      lng = Number(b.longitude);
    } else {
      if (!b.address_line?.trim() || b.address_line.trim().length < 8) {
        return bad("Açık adres en az 8 karakter olmalıdır.");
      }
      const geo = await geocodeAddress({
        address_line: b.address_line,
        neighborhood: b.neighborhood,
        district: b.district,
        city: b.city,
        country: (b.country || "Türkiye").trim(),
      });
      if (!geo) return bad(GEO_FAIL, 422);
      lat = geo.lat;
      lng = geo.lng;
    }

    const minBuy = Math.max(1, Number(b.min_buy_m2) || 1);
    const maxBuy = Math.max(minBuy, Number(b.max_buy_m2) || b.available_m2);
    const price = Math.max(0, Number(b.price_per_m2) || 0);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) return bad("Sunucu yapılandırması eksik (NEXT_PUBLIC_SUPABASE_URL)", 500);

    const descParts = [b.listing_description?.trim(), b.address_line?.trim()].filter(Boolean);
    const listingDescription = descParts.length ? descParts.join("\n\n") : null;

    const row = {
      title: b.title.trim(),
      country: (b.country || "Türkiye").trim(),
      city: b.city.trim(),
      district: b.district.trim(),
      neighborhood: (b.neighborhood || "").trim() || null,
      listing_description: listingDescription,
      total_area_m2: b.total_area_m2,
      available_m2: b.available_m2,
      sold_m2: 0,
      min_buy_m2: minBuy,
      max_buy_m2: Math.min(maxBuy, b.available_m2),
      price_per_m2: price,
      zoning_status: (b.zoning_status || "bilinmiyor").trim(),
      ada_no: b.ada_no?.trim() || null,
      parcel_no: b.parcel_no?.trim() || null,
      latitude: lat,
      longitude: lng,
      owner_name: b.owner_name.trim(),
      owner_phone: b.owner_phone.trim(),
      owner_email: b.owner_email.trim(),
      deed_image_url: b.deed_image_url?.trim() || null,
      submitted_by: (b.submitted_by || b.owner_email).trim(),
      is_real: true,
      listing_status: "pending",
      status: "pending",
      is_verified: false,
      risk_score: 50,
      development_score: 50,
      expected_annual_return: 12,
      last_30d_change: 0,
      total_shares: 100000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (serviceKey) {
      const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
      console.log("[submit-property] FINAL INSERT PAYLOAD", JSON.stringify(row, null, 2));
      const { error } = await sb.from("properties").insert(row);
      if (error) return bad(error.message || "Kayıt başarısız", 500);
      return NextResponse.json({ ok: true });
    }

    return bad(
      "Sunucu kayıt anahtarı (SUPABASE_SERVICE_ROLE_KEY) tanımlı değil. İlan formu doğrudan tarayıcıdan gönderilecek.",
      503
    );
  } catch (e: any) {
    return bad(e?.message || "Beklenmeyen hata", 500);
  }
}
