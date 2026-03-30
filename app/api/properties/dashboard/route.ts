import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAGE = 1000;

/**
 * Sadece kesin var olan / migrasyonlu kolonlar — geniş select’te olmayan kolon API’yi patlatmasın.
 * Panel için ek alanlar istemci tarafında ikinci istekle eklenebilir.
 */
const SELECT_MINIMAL =
  "id,title,country,city,district,neighborhood,latitude,longitude,price_per_m2,total_area_m2,available_m2,sold_m2,min_buy_m2,max_buy_m2,zoning_status,risk_score,development_score,expected_annual_return,last_30d_change,rental_yield_annual,quality_score,created_at,listing_status,is_real";

export async function GET(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ ok: false, error: "Supabase yapılandırması eksik" }, { status: 500 });
  }
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY yok", useClient: true }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Yetki gerekli" }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await authClient.auth.getUser(token);
  if (authErr || !user?.id) {
    return NextResponse.json({ ok: false, error: "Geçersiz oturum" }, { status: 401 });
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const all: unknown[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("properties")
      .select(SELECT_MINIMAL)
      .in("listing_status", ["approved"])
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const chunk = Array.isArray(data) ? data : [];
    for (const row of chunk) all.push(row);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ ok: true, count: all.length, items: all });
}
