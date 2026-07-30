import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey, responseMissingServiceRole } from "@/lib/server/supabaseServiceRole";

export const runtime = "nodejs";

const MAX_DEPOSIT = 10_000_000;

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

/**
 * Demo bakiye yükleme — gerçek bir ödeme sağlayıcısına bağlı değil.
 * Bu platform simülasyon amaçlıdır; gerçek banka/kart üzerinden tahsilat yapılmaz.
 */
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
  if (authErr || !user?.id) return bad("Oturum geçersiz", 401);

  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return bad("Geçersiz istek gövdesi", 400);
  }
  const amount = Math.round(Number(body.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_DEPOSIT) {
    return bad(`Tutar 1 ile ${MAX_DEPOSIT} arasında olmalı`, 400);
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: w } = await sb.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
  const curBal = w?.balance != null ? Number(w.balance) : 0;
  const nextBal = curBal + amount;

  const { data: upRows, error: upErr } = await sb
    .from("wallets")
    .update({ balance: nextBal })
    .eq("user_id", user.id)
    .select("user_id");
  if (upErr) return bad(upErr.message, 500);

  if (!upRows?.length) {
    const { error: insErr } = await sb.from("wallets").insert({ user_id: user.id, balance: nextBal });
    if (insErr) return bad(insErr.message, 500);
  }

  return NextResponse.json({ ok: true, balance: nextBal });
}
