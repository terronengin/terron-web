import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const property_id = String(body.property_id ?? "").trim();
    const inquiry_id =
      body.inquiry_id != null && String(body.inquiry_id).trim() !== ""
        ? String(body.inquiry_id).trim()
        : null;
    const customer_name = String(body.customer_name ?? "").trim();
    const customer_phone = String(body.customer_phone ?? "").trim();
    const customer_email = body.customer_email != null ? String(body.customer_email).trim() || null : null;
    const requested_m2 =
      body.requested_m2 != null && body.requested_m2 !== "" ? Number(body.requested_m2) : null;
    const offered_price_per_m2 =
      body.offered_price_per_m2 != null && body.offered_price_per_m2 !== ""
        ? Number(body.offered_price_per_m2)
        : null;
    const total_offer_amount =
      body.total_offer_amount != null && body.total_offer_amount !== ""
        ? Number(body.total_offer_amount)
        : null;
    const customer_note = body.customer_note != null ? String(body.customer_note).trim() || null : null;

    if (!property_id) return bad("property_id gerekli");
    if (!customer_name) return bad("Ad soyad gerekli");
    if (!customer_phone) return bad("Telefon gerekli");

    if (requested_m2 != null && (!Number.isFinite(requested_m2) || requested_m2 < 0)) return bad("m² geçersiz");
    if (offered_price_per_m2 != null && (!Number.isFinite(offered_price_per_m2) || offered_price_per_m2 < 0))
      return bad("Teklif ₺/m² geçersiz");
    if (total_offer_amount != null && (!Number.isFinite(total_offer_amount) || total_offer_amount < 0))
      return bad("Toplam teklif geçersiz");

    const row = {
      property_id,
      inquiry_id,
      customer_name,
      customer_phone,
      customer_email,
      requested_m2: requested_m2 != null && Number.isFinite(requested_m2) ? requested_m2 : null,
      offered_price_per_m2:
        offered_price_per_m2 != null && Number.isFinite(offered_price_per_m2) ? offered_price_per_m2 : null,
      total_offer_amount:
        total_offer_amount != null && Number.isFinite(total_offer_amount) ? total_offer_amount : null,
      customer_note,
      status: "new",
      deposit_status: "none",
      admin_note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) return bad("Sunucu yapılandırması eksik", 500);

    if (serviceKey) {
      const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await sb.from("property_reservations").insert(row).select("id").maybeSingle();
      if (error) return bad(error.message || "Kayıt başarısız", 500);
      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    return bad("SUPABASE_SERVICE_ROLE_KEY tanımlı değil. İstemci insert denenecek.", 503);
  } catch (e: any) {
    return bad(e?.message || "Beklenmeyen hata", 500);
  }
}
