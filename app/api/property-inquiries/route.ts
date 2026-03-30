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
    const property_title = body.property_title != null ? String(body.property_title).trim() : null;
    const customer_name = String(body.customer_name ?? "").trim();
    const customer_phone = String(body.customer_phone ?? "").trim();
    const customer_email = body.customer_email != null ? String(body.customer_email).trim() || null : null;
    const message = body.message != null ? String(body.message).trim() || null : null;
    const requested_m2 =
      body.requested_m2 != null && body.requested_m2 !== ""
        ? Number(body.requested_m2)
        : null;
    const budget =
      body.budget != null && body.budget !== "" ? Number(body.budget) : null;
    const contact_preference = body.contact_preference != null ? String(body.contact_preference).trim() || null : null;

    if (!property_id) return bad("property_id gerekli");
    if (!customer_name) return bad("Ad soyad gerekli");
    if (!customer_phone) return bad("Telefon gerekli");

    if (requested_m2 != null && (!Number.isFinite(requested_m2) || requested_m2 < 0)) return bad("m² geçersiz");
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) return bad("Bütçe geçersiz");

    const row = {
      property_id,
      property_title,
      customer_name,
      customer_phone,
      customer_email,
      message,
      requested_m2: requested_m2 != null && Number.isFinite(requested_m2) ? requested_m2 : null,
      budget: budget != null && Number.isFinite(budget) ? budget : null,
      contact_preference,
      status: "new",
      admin_note: null,
      created_at: new Date().toISOString(),
    };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) return bad("Sunucu yapılandırması eksik", 500);

    if (serviceKey) {
      const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await sb.from("property_inquiries").insert(row).select("id").maybeSingle();
      if (error) return bad(error.message || "Kayıt başarısız", 500);
      return NextResponse.json({ ok: true, id: data?.id ?? null });
    }

    return bad("SUPABASE_SERVICE_ROLE_KEY tanımlı değil. İstemci insert denenecek.", 503);
  } catch (e: any) {
    return bad(e?.message || "Beklenmeyen hata", 500);
  }
}
