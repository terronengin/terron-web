import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin/isAdmin";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

const MAX_ABS = 1_000_000_000_000;

/** Cüzdana TRY ekler veya düşürür (admin). `direction`: add | subtract */
export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = getServiceRoleKey();

  if (!supabaseUrl || !anonKey) return bad("Supabase yapılandırması eksik", 500);
  if (!serviceKey) return responseMissingServiceRole();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return bad("Yetki gerekli", 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: authErr,
  } = await authClient.auth.getUser(token);
  if (authErr || !user?.email || !isAdminEmail(user.email)) {
    return bad("Bu işlem için yetkiniz yok", 403);
  }

  let body: { userId?: unknown; amountTry?: unknown; direction?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("Geçersiz istek gövdesi", 400);
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || userId.length < 30) {
    return bad("Geçerli kullanıcı seçin", 400);
  }

  const dirRaw = body.direction;
  const direction = dirRaw === "subtract" ? "subtract" : "add";

  const raw = body.amountTry;
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return bad("Pozitif bir tutar girin (₺)", 400);
  }
  const delta = Math.round(amount);
  if (delta <= 0 || delta > MAX_ABS) {
    return bad(`Tutar 1 ile ${MAX_ABS.toLocaleString("tr-TR")} ₺ arasında olmalı`, 400);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authLookup, error: authLookupErr } = await sb.auth.admin.getUserById(userId);
  if (authLookupErr) {
    return NextResponse.json({ ok: false, error: authLookupErr.message }, { status: 500 });
  }
  if (!authLookup.user?.id) {
    return bad("Bu kullanıcı bulunamadı", 404);
  }

  const { data: w, error: wSelErr } = await sb.from("wallets").select("user_id,balance").eq("user_id", userId).maybeSingle();
  if (wSelErr) return NextResponse.json({ ok: false, error: wSelErr.message }, { status: 500 });

  const prev = w?.balance != null ? Number(w.balance) : 0;
  const base = Number.isFinite(prev) ? prev : 0;
  const cur = direction === "add" ? base + delta : base - delta;

  if (direction === "subtract" && cur < 0) {
    return bad("Bakiye bu tutarı karşılamıyor.", 400);
  }

  if (!w) {
    const { error: insErr } = await sb.from("wallets").insert({ user_id: userId, balance: Math.max(0, cur) });
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  } else {
    const { error: upErr } = await sb.from("wallets").update({ balance: cur }).eq("user_id", userId);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    balance: cur,
    delta: direction === "add" ? delta : -delta,
    direction,
  });
}
