import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PROPERTIES_EXPLORER_SELECT } from "@/lib/dashboard/propertiesExplorerSelect";

export const runtime = "nodejs";

const PAGE = 1000;

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

  // Önce toplam satır sayısını al (hızlı), sonra tüm sayfaları TEK SEFERDE paralel çek.
  // Eskiden sayfalar sırayla (biri bitmeden diğeri başlamadan) çekiliyordu — ~6800 satır
  // için 7 ayrı bekleme toplamda 5-8 saniye sürüyordu. Paralel istek bunu ~1 isteklik
  // süreye indirir.
  const { count, error: countErr } = await sb
    .from("properties")
    .select("id", { count: "exact", head: true })
    .in("listing_status", ["approved"]);

  if (countErr) {
    return NextResponse.json({ ok: false, error: countErr.message }, { status: 500 });
  }

  const total = count ?? 0;
  const pageCount = total > 0 ? Math.ceil(total / PAGE) : 0;

  const pageResults = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      sb
        .from("properties")
        .select(PROPERTIES_EXPLORER_SELECT)
        .in("listing_status", ["approved"])
        .order("created_at", { ascending: false })
        .range(i * PAGE, i * PAGE + PAGE - 1)
    )
  );

  const all: unknown[] = [];
  for (const { data, error } of pageResults) {
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (Array.isArray(data)) for (const row of data) all.push(row);
  }

  return NextResponse.json({ ok: true, count: all.length, items: all });
}
